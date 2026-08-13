import { defineVerb, objectArgs } from "../define.js";

export default defineVerb({
  id: "return",
  spokenForms: ["take me back", "where was I", "go back to"],
  description: "Return to the place you last kept in a document.",
  argsSchema: objectArgs({ documentName: { type: "string" } }),
  recordKinds: ["return", "intention", "proof"],
  status: "real",
  historyTitle: "returned",
  testReference: "test/return.e2e.test.mjs",
  intentNames: ["document.return"],
  commandFromIntent(event, evidence) {
    return { type: "return", verbId: "return", documentName: event.args.documentName ?? "", evidence };
  },
  describeIntent(args) {
    return args.documentName ? `go back to “${args.documentName}”` : "go back to where I was";
  },
  execute(ctx, args) {
    return ctx.returnTo(args);
  },
  createReturnEntry(
    { docId, revision, blockIndex, modality, evidence, matchedText = "", at },
    { makeCursor, makeReceipt, rid },
  ) {
    const cursor = makeCursor({
      docId,
      revision,
      blockIndex,
      modality,
      evidence,
      intention: `return to block ${blockIndex}`,
      at,
    });
    cursor.state = "return";
    cursor.undoAvailable = false;
    cursor.repairRoute = "open the document and choose another block";
    const proof = makeReceipt({
      docId,
      revision,
      blockIndex,
      actionId: rid("act"),
      result: `returned to block ${blockIndex}`,
      arrival: "exact",
      undoRoute: "read or choose another block",
      at,
    });
    return {
      id: rid("evt"),
      docId,
      kind: "return",
      act: "return",
      verbId: "return",
      blockIndex,
      blockEnd: null,
      modality,
      evidence,
      confidence: null,
      matchedText,
      noteText: "",
      undone: false,
      undoes: null,
      createdAt: at,
      cursor,
      receipt: proof,
    };
  },
});
