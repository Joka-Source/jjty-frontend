function labelFor(id) {
  return id.replaceAll("-", " ");
}

function textNode(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function renderCapabilities(container, registry, { openRoom } = {}) {
  container.textContent = "";
  for (const verb of registry.list()) {
    const card = document.createElement("article");
    card.className = "capability-card";
    card.dataset.capabilityId = verb.id;

    const head = document.createElement("div");
    head.className = "capability-head";
    head.appendChild(textNode("h2", "capability-name", labelFor(verb.id)));
    head.appendChild(textNode("span", `capability-status status-${verb.status}`, verb.status));
    card.appendChild(head);
    card.appendChild(textNode("p", "capability-description", verb.description));
    card.appendChild(
      textNode("p", "capability-spoken", `say: ${verb.spokenForms.join(" · ")}`),
    );
    card.appendChild(
      textNode(
        "p",
        "capability-records",
        verb.recordKinds.length ? `records: ${verb.recordKinds.join(" · ")}` : "records: none yet",
      ),
    );

    if (verb.status === "designed") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "capability-open";
      button.textContent = "open the designed room";
      button.addEventListener("click", () => verb.execute({ openRoom }, {}));
      card.appendChild(button);
    }
    container.appendChild(card);
  }
}

