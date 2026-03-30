# Team Workspaces

This document describes how team access and shared customer workspaces currently work in the platform.

## 1. Purpose

Team workspaces let a customer account owner share the same PDF/link workspace with additional users while keeping one account-level billing and subscription context.

This is useful for:

- assistants
- operations staff
- customer success teams
- internal client-side collaborators

## 2. Workspace Model

Each customer account can act as a shared workspace.

Workspace-scoped areas include:

- PDFs
- folders
- secure links
- direct link settings
- custom domains
- dashboard data
- team membership

## 3. Roles

Workspace roles:

- `owner`
- `admin`
- `member`

### Owner

- full control of the workspace
- can invite team members
- can remove members
- represents the billing/account owner

### Admin

- elevated collaborator role inside the workspace
- can perform broader management actions depending on permissions

### Member

- standard collaborator
- intended for lower-risk participation

## 4. Invitation Lifecycle

Typical invitation flow:

1. owner/admin invites a user by email
2. invitation is stored as pending
3. recipient opens invitation link
4. invitation is previewed
5. recipient explicitly accepts or declines
6. workspace membership becomes active on acceptance

Important:

- invitation acceptance should not silently complete under the wrong signed-in account
- the invited email should match the accepting account context

## 5. Workspace Switching

Users who belong to multiple workspaces can switch the active workspace from the authenticated app sidebar.

When the active workspace changes, the app should switch the scope for:

- dashboard
- PDFs
- folders
- links
- domains

## 6. Audit Expectations

Team and workspace actions should be attributable.

Important events include:

- invitation creation
- invitation acceptance
- invitation decline
- invitation cancellation
- member role updates
- member removal
- workspace-scoped PDF and link operations

Audit records should make it possible to answer:

- who acted
- in which account/workspace
- on which resource
- when

## 7. Billing Model

Current billing remains owner-account based.

That means:

- workspace members do not create independent subscriptions
- billing and plan state still belongs to the owner account

## 8. Team Management Surface

The customer-facing team management area should support:

- invite team member
- view current members
- change member role
- cancel pending invitation
- remove member
- leave workspace if appropriate

## 9. Common Support Cases

### Invitation Opens Under Wrong Signed-In Account

Expected behavior:

- show invitation preview
- show mismatch warning if wrong account is signed in
- require explicit acceptance

### Team Member Cannot See PDFs

Check:

- active workspace
- membership status
- role
- current workspace switcher value

### Invite Seems Accepted but Access Is Missing

Check:

- invitation status
- membership status
- active workspace in UI
- audit events

## 10. Operator Notes

- do not assume platform admin roles and workspace roles are the same thing
- workspace collaboration is customer-scope access, not platform-wide admin control
- billing remains centralized to owner account until explicitly redesigned

## 11. Future Enhancements

Strong next additions for team workspaces:

1. account-level staff permissions matrix
2. more granular role capabilities
3. billing-manager style team roles
4. workspace-scoped analytics by member
5. richer invite expiry and resend controls

