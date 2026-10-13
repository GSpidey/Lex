export default function AccountDeletion() {
  return (
    <main className="legal-shell">
      <nav>
        <a href="/">Workspace</a>
        <a href="/legal/">Legal Centre</a>
        <a href="/support/">Support</a>
      </nav>
      <p className="eyebrow">Your information</p>
      <h1>Account and data requests</h1>
      <section className="legal-card">
        <p>
          In the Lex app, sign in and open the privacy-request controls to
          request deletion, correction or export. Deleting the app alone does
          not delete your account.
        </p>
        <p>
          We verify the requester’s identity and review the request. Records
          needed for an unresolved engagement, payment dispute, legal obligation
          or security investigation may require limited retention. You will be
          told which categories are retained and why; the request is not a
          promise of immediate or unconditional erasure.
        </p>
        <p>
          If you cannot sign in during private testing, contact the Lex team
          through your original invitation channel. Do not send identity
          documents through an unverified channel.
        </p>
        <p>
          A public, verified alternative contact and finalized retention details
          are required before store submission. They have not yet been supplied
          for this private test release.
        </p>
      </section>
    </main>
  );
}
