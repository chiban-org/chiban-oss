---
title: Parcel ID formats
description: Tell Chiban which parcel ID numbers the town uses, and choose the one shown on parcel pages.
sidebar_position: 14
---

# Parcel ID formats

A parcel can have more than one number: the assessor's CAMA number and the map-lot ID from the town's GIS. **Parcel ID formats** under **Settings**, **Town** lists the numbers the town uses. Imports use these formats to match rows in a file to the right parcel, and one of them is the ID shown on parcel pages.

Chiban comes with two formats: **CAMA number**, exactly 15 digits, and **Map-lot ID**, exactly 12 digits. Leading zeros count. In Alder Pond the CAMA number is on 63 parcels and the Map-lot ID on 62, and the Map-lot ID is the one shown on parcels.

## Add or change a format

- **Add a format** asks for a **Short name** in lowercase letters, digits and underscores, for example cama15, which cannot be changed later. It then asks for a **Name** staff will see, whether **Characters allowed** are digits only or any text, and for digits a **Number of digits**. Leave the number blank to accept any number of digits.
- **Edit** changes the name and the shape.
- **Show this ID** makes a format the one shown on parcel pages.
- **Delete** appears only for a format no parcel ID uses yet.

Set this up before you load owners and parcels from the assessing office, because the file's ID column is matched against these formats. See [loading owners from the assessing file](../../moving-in/cama-import.md).

## When a number is wrong for one parcel

If a folder label or an old record uses a number that does not match the parcel in Chiban, add a parcel ID override. It points that ID at the right parcel, and imports never overwrite it. See [overrides](./overrides.md).
