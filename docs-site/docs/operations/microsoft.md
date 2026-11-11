---
title: The Microsoft 365 integration
sidebar_label: Microsoft 365
description: What Chiban uses Microsoft 365 for, where the connection is entered, how it signs in, and what has and has not been tested against a live tenant.
sidebar_position: 30
---

# The Microsoft 365 integration

This page is for whoever runs the server and the town's Microsoft 365 contact. Read the first section before you spend time on it: nothing here has been run against a live Microsoft 365 tenant.

## Where it stands

Both uses of Microsoft 365 are marked as practice connections in the code and on screen.

- On the **Inspection schedule** settings page, the notice reads "Microsoft calendar is a practice connection. No live Microsoft 365 tenant is connected, so invites for inspectors set to Microsoft calendar are only tested against a practice server and are not delivered to a real calendar."
- On the export target form for OneDrive, the notice reads "OneDrive and SharePoint copies are not connected to a live Microsoft 365 tenant. They have only been tested against a local stand-in."

The code that talks to Microsoft is tested against fake servers in `src/test/fakes`. If a town needs it, plan a trial against a test tenant first.

Chiban uses Microsoft 365 for these two things only. It does not use it to sign people in, to send mail or to read anyone's calendar. Staff sign in with a password and public users with an emailed link.

## No server settings

There is no environment setting for Microsoft 365. An administrator enters the connection in the application, and Chiban saves the client secret encrypted with the active key from `CHIBAN_SECRET_KEYS`. Nothing about it appears in `deploy/.env.example` or `deploy/docker-compose.yml`. If you lose the keys, the saved secret cannot be read and each Microsoft request fails with "the stored client secret cannot be read".

## How Chiban signs in to Microsoft

Chiban signs in as an application, not as a person. For each connection it requests a token from `https://login.microsoftonline.com/<tenant id>/oauth2/v2.0/token` using the client credentials grant and the scope `https://graph.microsoft.com/.default`, and it keeps the token until one minute before it expires. Whatever application permissions the town's Microsoft administrator granted to the app registration are the ones in force. For a drive, the [monthly export page](../reports-and-export/incremental-export.md) names the permissions to grant. This repository does not say which permission is needed to write to an inspector's calendar, so check that against Microsoft's documentation when the registration is made.

The entry forms have no field for the sign-in address or the Graph address, so the connection uses the public cloud addresses `https://login.microsoftonline.com` and `https://graph.microsoft.com`. The two columns `authority_base` and `graph_base` in the `calendar_accounts` table hold them and can be changed in the database for a different Microsoft cloud. No screen edits them.

## Inspector calendars

An administrator opens **Settings**, **Money and inspections**, **Inspection schedule** and finds two sections.

**Inspector calendars** sets, for each inspector, where booking invitations go: **Email with a calendar invite**, which needs nothing from Microsoft, or **Microsoft calendar (practice connection)**. The Microsoft choice also takes a **Microsoft 365 user**, the identifier that Graph uses to find the inspector's calendar. If it is blank, Chiban uses the inspector's email address.

**Microsoft 365 connection** holds three fields, **Directory (tenant) ID**, **Application (client) ID** and **Client secret**, under **Enter the connection details**. Until they are saved the section reads "Not connected. Invites go out by email." After they are saved it reads "Connection details are saved for" the tenant, "They have not been checked against a live Microsoft 365 account yet." Saving adds a new connection and deactivates the earlier one, so an installation has one at a time, and it writes an audit entry. Saving needs the permission to edit configuration.

Chiban stores the details without testing them. A wrong secret shows up only when an invitation is sent.

### What happens to a booking

When an inspection is booked, moved or cancelled, Chiban queues one calendar update for the inspector. The worker's calendar job sends it:

| Change | Request to Microsoft |
| --- | --- |
| New booking | `POST` to the inspector's events |
| Moved booking | `PATCH` of the event Chiban created before |
| Cancelled booking | `DELETE` of that event. A reply that the event is already gone counts as done. |

Each event carries a transaction id made from the booking's invitation id and its revision number, so repeating a request does not create a second event. Chiban remembers the event id Microsoft returns.

A reply of 401 or 403 is recorded as an authorization failure. A reply of 429 or 500 and above, or no reply, is recorded as unreachable. Any other refusal is recorded as rejected. A failed update goes back in the queue with the reason saved, and is tried again, up to 5 attempts in all. After that it is marked failed. The worker's sweep job re-queues updates that sit unsent for more than 60 seconds. If an inspector is set to Microsoft calendar and no connection is saved, every update fails with "no Microsoft tenant is connected". Nothing on screen lists failed updates.

## OneDrive and SharePoint export targets

The same sign-in is used for an export target of the OneDrive kind, which copies a town's monthly export, or a backup, into a drive. An administrator adds one under **Settings**, **Data export**, **Copy exports to your own storage every month**, by choosing the kind **OneDrive or SharePoint** with four fields: **Microsoft 365 tenant ID**, **App registration (client) ID**, **Drive ID** and **Client secret**. The secret is stored encrypted and is not shown again.

Files up to 4 MiB are sent in one request. Larger files go through an upload session in chunks of 3,276,800 bytes, replacing a file of the same name. A reply of 401 or 403 is recorded as denied, 429 or 500 and above as unreachable, and any other refusal as a bad response.

The [monthly export](../reports-and-export/incremental-export.md) and [backup](./backups.md) pages explain what is copied. A backup can be sent to a target by name.

## In demo mode

Saving the connection, an inspector's calendar target and export targets are all refused in a demo, with the message that the demo does not allow changes that would affect every visitor.
