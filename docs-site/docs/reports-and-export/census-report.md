---
title: The Census building permits report
sidebar_label: Census report
description: Count new housing units from issued permits for the Census Bureau's monthly report, confirm each permit's classification and download the result.
sidebar_position: 2
---

# The Census building permits report

Towns report new housing to the Census Bureau, on Form C-404, from the building permits they issue. Chiban totals those permits for a month or a year, in the categories the form uses, so you can key the numbers into the Census site. Chiban does not send anything to the Census Bureau.

Administrators, land use staff and finance staff can open it from **Reports**, under **Other reports**, as **Census building permits**.

![The Census building permits report, with a permit waiting to be classified](/img/shots/reports/census.png)

## Choosing the period

Set the **Year** and the **Period**, either **Whole year** or one month, and choose **Show report**. The heading shows the town and the period. The report counts permits issued in that period, by issue date, and only permits of the building permit classification, which in the starter catalog is the **Building or demolition permit**. Trade permits such as electrical and plumbing do not count.

## What the report shows

- **Section 3: Housing units authorized** has one row for each Census item: **101** single-family houses, **103** two-unit buildings, **104** three- and four-unit buildings and **105** buildings with five or more units. Each row gives the **Buildings**, **Housing units** and **Valuation in dollars**.
- **Section 4: Permits valued at $1,000,000 or more** lists each large permit with its number, description, site address, owner or builder and counts. It can be sorted by any column.

When no building permit was issued, the page says "No permits issued."

## Confirming each permit

Chiban cannot tell a new building from an addition, so no permit counts until someone confirms it. Until every issued building permit in the period is classified, the page says "This report is not complete" and how many permits need classification, and the download links are hidden.

The **Needs classification** section lists each such permit. Chiban suggests an answer from the application when it can, and says so: "Suggested from the application." Otherwise it says "No suggestion: enter the counts." For each permit confirm:

- **Kind of structure.** One of the four items above, or **Left out of the count**.
- **If left out of the count, why.** For example **Publicly owned**, **Not housing**, **Moved or relocated building**, **Farm building**, **HUD-inspected manufactured home**, **Demolition**, **Addition or alteration**, **Maintenance or repair** or **Reissued permit with unchanged plans**.
- **Phase.** **Whole building**, or **Foundation or finish work only**.
- **Buildings**, **Housing units** and **Valuation in whole dollars.**

Choose **Save classification**. The permit moves out of the list and into the totals. A permit's classification is saved with it, so the next time you look, even for a different period, you are not asked again.

## Downloading

Once the report is complete, **Download CSV** and **Download Excel** appear. The file holds both sections. For a monthly email of this report, see [scheduled reports](./scheduled-reports.md). A schedule can send the census report only monthly. If a permit still needs classification when the email would go, the email says the report is not attached and why, and you classify the permit on this page and download from here.
