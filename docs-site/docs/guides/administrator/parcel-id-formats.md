---
title: Parcel ID formats
description: Tell Chiban which parcel ID numbers the town uses, and choose the one shown on parcel pages.
sidebar_position: 14
---

# Parcel ID formats

A parcel can have more than one number: the assessor's CAMA number and the map-lot ID from the town's GIS. **Parcel ID formats**, in the **Town** group under **Settings**, lists the numbers the town uses. Imports use these formats to match rows in a file to the right parcel, and one of them is the ID shown on parcel pages.

A new New Hampshire installation starts with two formats, **CAMA number** (short name cama15), exactly 15 digits, and **Map-lot ID** (short name gis12), exactly 12 digits. Leading zeros count. After that the list belongs to your installation: you add, change and delete formats on this screen, and each town keeps its own. In Alder Pond the CAMA number is on 63 parcels and the Map-lot ID on 62, and the Map-lot ID is the one shown on parcels.

## Add or change a format

- **Add a format** asks for a **Short name** in lowercase letters, digits and underscores, for example cama15, which cannot be changed later. It then asks for a **Name** staff will see, whether **Characters allowed** are digits only or any text, and for digits a **Number of digits**. Leave the number blank to accept any number of digits.
- **Edit** changes the name and the shape.
- **Show this ID** makes a format the one shown on parcel pages.
- **Delete** appears only for a format no parcel ID uses yet.

Set the formats up before you load owners from the assessing office, because the ID column in that file is matched against them. See [loading owners from the assessing file](../../moving-in/cama-import.md).

## When a number is wrong for one parcel

If a folder label or an old record uses a number that does not match the parcel in Chiban, add a parcel ID override. It points that ID at the right parcel, and imports never overwrite it. See [overrides](./overrides.md).
