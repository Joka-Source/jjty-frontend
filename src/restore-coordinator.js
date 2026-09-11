export class RestoreFailure extends Error {
  constructor(message, { recovered, cause, rollbackErrors = [] }) {
    super(message, { cause });
    this.name = "RestoreFailure";
    this.recovered = recovered;
    this.rollbackErrors = rollbackErrors;
  }
}

/**
 * Coordinate recovery across local settings, the separate sync outbox database,
 * and the application-data transaction. IndexedDB cannot make two databases
 * atomic, so a failed data commit is explicitly compensated and reported.
 */
export async function restoreDeviceBackup({
  backup,
  restoreQueued,
  applyLocal,
  revertLocal,
  getOutbox,
  replaceOutbox,
  getDeliveryLog,
  replaceDeliveryLog,
  replaceAllData,
}) {
  let priorOutbox = null;
  let priorDeliveryLog = null;
  let outboxChanged = false;
  let deliveryLogChanged = false;
  try {
    applyLocal();
    if (restoreQueued) {
      priorOutbox = await getOutbox();
      await replaceOutbox(backup.transport.queued);
      outboxChanged = true;
      priorDeliveryLog = await getDeliveryLog();
      await replaceDeliveryLog(backup.transport.log);
      deliveryLogChanged = true;
    }
    await replaceAllData(backup);
  } catch (cause) {
    const rollbackErrors = [];
    try { revertLocal(); } catch (error) { rollbackErrors.push(error); }
    if (outboxChanged) {
      try { await replaceOutbox(priorOutbox); } catch (error) { rollbackErrors.push(error); }
    }
    if (deliveryLogChanged) {
      try { await replaceDeliveryLog(priorDeliveryLog); } catch (error) { rollbackErrors.push(error); }
    }
    if (rollbackErrors.length === 0) {
      throw new RestoreFailure(
        `restore failed; the previous data was recovered. ${cause?.message ?? cause}`,
        { recovered: true, cause },
      );
    }
    throw new RestoreFailure(
      `restore failed and recovery is incomplete. ${cause?.message ?? cause}; rollback: ${rollbackErrors.map((error) => error?.message ?? error).join("; ")}`,
      { recovered: false, cause, rollbackErrors },
    );
  }
}
