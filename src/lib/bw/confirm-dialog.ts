/**
 * Promise-based confirm() backed by the singleton <dialog id="confirm-dialog">
 * mounted once in BaseLayout.astro — styled consistently with the rest of the
 * app instead of the browser's native confirm() popup. Works from both plain
 * <script> code and React/Svelte islands, since it's just DOM lookups.
 */
export function confirmDialog(
  message: string,
  labels: { cancel: string; continueAction: string },
): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.getElementById("confirm-dialog") as HTMLDialogElement | null
    if (!dialog) {
      resolve(window.confirm(message))
      return
    }
    const messageEl = document.getElementById("confirm-dialog-message")!
    const cancelBtn = document.getElementById("confirm-dialog-cancel")!
    const continueBtn = document.getElementById("confirm-dialog-continue")!

    messageEl.textContent = message
    cancelBtn.textContent = labels.cancel
    continueBtn.textContent = labels.continueAction

    let settled = false
    function finish(result: boolean) {
      if (settled) return
      settled = true
      cancelBtn.removeEventListener("click", onCancel)
      continueBtn.removeEventListener("click", onContinue)
      dialog!.removeEventListener("cancel", onNativeCancel)
      dialog!.close()
      resolve(result)
    }
    function onCancel() {
      finish(false)
    }
    function onContinue() {
      finish(true)
    }
    // Escape key or backdrop click (via the built-in <form method="dialog">-less
    // cancel event) — treat the same as pressing Cancel.
    function onNativeCancel(e: Event) {
      e.preventDefault()
      finish(false)
    }

    cancelBtn.addEventListener("click", onCancel)
    continueBtn.addEventListener("click", onContinue)
    dialog.addEventListener("cancel", onNativeCancel)
    dialog.showModal()
  })
}
