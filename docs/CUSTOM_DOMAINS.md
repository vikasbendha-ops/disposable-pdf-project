# Custom Domains

This document explains how custom domains work for customer-facing secure and direct PDF links.

## 1. Goal

Customers can use their own domain or subdomain instead of the platform’s shared domain for:

- secure viewer links
- direct PDF links where allowed

## 2. Verification Model

The platform requires three things before a domain is considered ready:

1. ownership verification
2. routing verification
3. active SSL

Until all required checks pass, the domain should not be treated as ready for link issuance.

## 3. Supported DNS Records

### Ownership

TXT record:

- host prefix is based on the configured TXT prefix
- value is the generated verification token

### Routing

For subdomains:

- CNAME to the configured Vercel target

For apex domains:

- A record to the accepted target IP(s), if allowed by the platform configuration

## 4. Platform Configuration Inputs

Important env vars:

- `CUSTOM_DOMAIN_TXT_PREFIX`
- `CUSTOM_DOMAIN_VERCEL_CNAME_TARGET`
- `CUSTOM_DOMAIN_CNAME_TARGETS`
- `CUSTOM_DOMAIN_A_TARGETS`
- `CUSTOM_DOMAIN_VERIFY_TIMEOUT_MS`

Optional Vercel automation:

- `VERCEL_API_TOKEN`
- `VERCEL_PROJECT_ID`
- `VERCEL_TEAM_ID`
- `VERCEL_AUTO_DOMAIN_ATTACH`

## 5. User Workflow

From customer settings:

1. user adds a domain
2. app generates required DNS details
3. user adds DNS records with their DNS provider
4. user clicks verify
5. app checks DNS and SSL state
6. domain becomes ready if checks pass

## 6. What the User Should See

A good domain experience should show:

- exact TXT host and value
- exact CNAME target or A record target
- verification status
- SSL status
- Vercel status if automation is enabled
- domain-specific error detail

## 7. Vercel Automation

If configured, the platform can attempt to:

- attach the domain to the Vercel project
- verify the domain through Vercel
- track Vercel-side status

This reduces manual operator work, but DNS ownership still belongs to the customer.

## 8. SSL Behavior

The platform should only use the domain after SSL is active.

Typical flow:

- DNS resolves correctly
- Vercel/Let’s Encrypt provisions certificate
- platform marks SSL active
- domain becomes ready for use

## 9. Troubleshooting

### DNS Ownership Fails

Check:

- TXT host is correct
- TXT value matches exactly
- DNS propagation has completed

### Routing Fails

Check:

- CNAME target is correct for subdomains
- A record target is correct for apex domains
- no conflicting records remain

### SSL Not Active

Check:

- routing is correct
- Vercel domain attach succeeded
- enough time has passed for certificate issuance

### Domain Attached but Not Ready

Check:

- TXT verification
- routing records
- SSL status
- any stored verification error

## 10. Operator Best Practices

- keep the platform domain as a safe fallback
- do not mark a domain ready prematurely
- verify that default domain selection in user settings points to a ready domain
- review domain failures inside admin operations and support workflows

## 11. Security Notes

Custom domains affect user trust and link legitimacy. Because of that:

- ownership must be verified
- SSL must be active
- domain state should be visible in admin support flows

## 12. Future Enhancements

Natural additions:

1. retry helpers for failed verification
2. clearer apex vs subdomain guidance in UI
3. richer support diagnostics for DNS mismatch
4. bulk domain review for admins

