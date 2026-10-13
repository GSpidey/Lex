const required = [
  "LEX_STAGING_API_URL",
  "LEX_FOUNDER_BOOTSTRAP_TOKEN",
  "LEX_PRIMARY_OWNER_PHONE",
  "LEX_PRIMARY_OWNER_EMAIL",
  "LEX_PARTNER_OWNER_PHONE",
  "LEX_PARTNER_OWNER_EMAIL",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0)
  throw new Error(
    `Missing secure founder-bootstrap environment: ${missing.join(", ")}`,
  );

const payload = JSON.stringify({
  founders: [
    {
      label: "Primary owner",
      phone: process.env.LEX_PRIMARY_OWNER_PHONE,
      email: process.env.LEX_PRIMARY_OWNER_EMAIL,
      roles: ["client", "owner"],
      defaultRole: "owner",
    },
    {
      label: "Partner owner-lawyer",
      phone: process.env.LEX_PARTNER_OWNER_PHONE,
      email: process.env.LEX_PARTNER_OWNER_EMAIL,
      roles: ["owner", "lawyer"],
      defaultRole: "lawyer",
    },
  ],
});

let completed = false;
for (let attempt = 0; attempt < 15; attempt += 1) {
  const response = await fetch(
    `${process.env.LEX_STAGING_API_URL.replace(/\/$/u, "")}/internal/founder-bootstrap`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-founder-bootstrap-token": process.env.LEX_FOUNDER_BOOTSTRAP_TOKEN,
      },
      body: payload,
    },
  );
  const body = await response.json();
  if (response.ok) {
    console.log(
      `Bootstrapped ${body.bootstrapped.length} authorized staging founder accounts without writing contacts to source.`,
    );
    completed = true;
    break;
  }
  if (![401, 404, 503].includes(response.status) || attempt === 14)
    throw new Error(
      body.message ?? `Founder bootstrap failed (${response.status})`,
    );
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
if (!completed) throw new Error("Founder bootstrap did not complete");
