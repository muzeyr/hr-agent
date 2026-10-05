// Restructures the plugin's approval prompt into the layout approval-card.css
// styles: details bubble ("Tool: …", "Args: {…}") and a separate decision box.
// The plugin keeps owning the behaviour — its buttons and their click
// handlers are moved, not replaced — so approving still resumes the task the
// way the plugin expects. Injected by srv/server.ts.
(() => {
  const messages = document.getElementById("messages");
  if (!messages) return;

  const restructure = (el) => {
    if (el.dataset.restyled) return;
    el.dataset.restyled = "1";
    const actions = el.querySelector(".approval-actions");
    const [content] = el.children;
    const args = el.querySelector(":scope > pre");

    const details = document.createElement("div");
    details.className = "approval-details";
    details.append(content);
    if (args) {
      const label = document.createElement("p");
      label.className = "approval-args-label";
      label.textContent = "Args:";
      details.append(label, args);
    }
    el.prepend(details);

    if (actions) {
      const question = document.createElement("p");
      question.className = "approval-question";
      question.textContent = "This action needs your approval.";
      actions.prepend(question);
      // Capture phase: runs before the plugin's handler removes the prompt,
      // and leaves a record of the decision in the conversation.
      actions.addEventListener(
        "click",
        (event) => {
          const button = event.target.closest("button");
          if (!button) return;
          const approved = !button.classList.contains("btn-reject");
          const done = document.createElement("div");
          done.className = `approval-done ${approved ? "approved" : "rejected"}`;
          done.innerHTML = details.innerHTML;
          const result = document.createElement("div");
          result.className = "approval-result";
          result.textContent = approved ? "✓ Approved" : "✕ Rejected";
          done.append(result);
          el.before(done);
        },
        true,
      );
    }
  };

  new MutationObserver((mutations) => {
    for (const m of mutations)
      for (const node of m.addedNodes)
        if (node.nodeType === 1 && node.classList.contains("approval")) restructure(node);
  }).observe(messages, { childList: true });
})();
