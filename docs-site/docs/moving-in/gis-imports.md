---
title: Loading parcel maps and other GIS layers
sidebar_label: GIS layers
description: Bring the town's parcel, road and water layers into Chiban from a file or a map service, and read the report each import leaves.
sidebar_position: 1
---

# Loading parcel maps and other GIS layers

Chiban draws its maps from layers the town gives it: the parcels, the roads and the water. The parcel layer matters most. It creates the parcels everything else is filed under, and it carries the parcel IDs. Load it once when you set up, then again whenever the town's GIS office changes the parcel map.

You need the permission to run imports, which administrators and land use staff have. Changing where a layer comes from also needs the administrator role. The work happens on the **Imports** page, under **Parcel data** in the staff menu.

![The Imports page, with a card for each layer and the list of recent runs](/img/shots/moving-in/gis-imports.png)

Before loading parcels, an administrator needs to set up the town's parcel ID formats under **Settings**. If they are missing, the page says so at the top. The formats tell Chiban what a map-lot ID looks like, so it can tell a good ID from a typo.

## The four cards

The page has one card each for **Parcels**, **Roads**, **Water** and **CAMA**. Each card says how fresh the layer is: **Never imported**, **Fresh**, **Stale** when it is older than the layer's limit, **Last import failed** with the reason, or **Not configured**. Owner names and mailing addresses come in through the CAMA card, which has its own page. See [loading owners from the assessing file](./cama-import.md).

## Loading a layer from a file

1. On the layer's card, pick the **File format**: **GeoJSON** (`.geojson` or `.json`), **Shapefile** (a `.zip` that includes the `.prj` file) or **GeoPackage** (`.gpkg`).
2. Choose the file in **File**. It can be up to 100 MB.
3. Choose **Run import**.

When it finishes, the card links to the run report. A shapefile is converted from the coordinate system recorded in its `.prj` file, and a zip with no `.prj` is refused because Chiban cannot place it. A GeoJSON file must already be in standard longitude and latitude (WGS 84). One that declares another coordinate system is refused.

## Loading a layer from a map service

A layer can instead point at a map service that the town's GIS office runs, an Esri feature service or AxisGIS. An administrator sets it up under **Layer settings** on the card. Then the card shows a plain **Run import** button with no file, and Chiban also refreshes the layer by itself, checking each hour whether the layer is older than its **Refresh every (hours)** setting.

The AxisGIS connection has not been checked against a live town service. The card says so.

**Layer settings** holds the **Source**, the **Source URL**, a **Field mapping (JSON)** that says which columns hold the parcel ID, address and owner, **Mark stale after (days)** and **Refresh every (hours)**. The mapping is a technical box. Whoever set Chiban up for the town should fill it in, and it rarely changes.

## What a parcel import does

Chiban matches each feature in the file to a parcel by its ID.

- A feature whose ID Chiban has never seen becomes a new parcel.
- A feature that matches a parcel updates its shape and its site address.
- A parcel with no owner name or mailing address gets the one in the file. A different owner or mailing address is never written over. It waits on the [exceptions list](./import-exceptions.md) as an owner change.
- Several features with the same ID are joined into one parcel, and the report counts them as merged parts.
- Every file you upload counts as the whole layer. Parcels Chiban has that are missing from the file are listed as exceptions, and nothing is deleted.
- Loading the same file again changes nothing.
- When the import brings in a parcel that [unresolved records](./unresolved-records.md) were waiting for, they link to it automatically.

A feature Chiban cannot use goes to the exceptions list with the reason, and the rest of the file still loads. Roads and water only need a shape, and a name if one is mapped.

## The run report

Every import adds a row under **Recent runs**: when it started, the layer, the source and whether it **Succeeded** or **Failed**. Open a run to see its report.

| Line | Meaning |
| --- | --- |
| **Rows in** | Rows read from the file |
| **Created** | New parcels or features |
| **Applied** | Existing ones that changed |
| **Unchanged** | Existing ones that already matched |
| **Excepted** | Rows set aside as exceptions |
| **Source features** | Features in the file before joining parts |
| **Merged parts** | Extra pieces joined into a parcel |
| **Missing from layer** | Parcels Chiban has that the file did not list |

Under **Exceptions by kind** the report counts each reason, and **View the exception queue** goes to the list.

Only one import of a layer can run at a time. If another is running, the page asks you to try again in a moment.
