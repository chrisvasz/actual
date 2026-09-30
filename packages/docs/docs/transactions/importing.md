# Importing Transactions

There are various ways to get transactions into Actual.

## Linked Bank Import

Actual Budget supports [linking your bank accounts](../advanced/bank-sync.md) to sync using SimpleFIN, GoCardless or Pluggy.ai.

There are also [community projects](../community-repos.md) that implement bank syncing.

## Import Financial Files

A quick way to import transactions is to login to your bank's website and download a file.

Actual supports importing CSV, QIF, OFX, QFX and CAMT files. Your bank probably allows you to download one of these formats (OFX/QFX is recommended).

1. Open the account you want to import transactions into.
2. Press the **Import** button and select the file.

## Import CSV Files

If your bank doesn't support downloading financial files, you can import a CSV file instead.

1. Open the account you want to import transactions into.
2. Press the **Import** button and select the file.
3. Select the **CSV** option.
4. Set up the fields to match the CSV file.
   - Under each table heading there is a dropdown for picking the column from your CSV that holds that field. Leave it as "Choose field…" to leave the field blank.
   - If the date is not being imported correctly, change the date format in the dropdown next to the date column picker. Dates that don't match the selected format are shown in red. Hover over a date to see how it appears in your file.
   - If the file can't be imported at all, press **Change** next to **File format** to adjust the delimiter, encoding, header row and lines to skip. (Let us know if your file uses a different delimiter that isn't listed!) These settings are remembered for each account.
   - You can optionally toggle on "Flip amount" if you want to negate all of the amounts in the CSV file.
   - Use the **Amounts** dropdown if your CSV file doesn't have a single amount column. Choose "Outflow + inflow columns" if it has separate columns for outflow and inflow amounts (also known as debit and credit), or "Amount + in/out column" if a separate column says whether each amount is going in or out.
   - You can enter a number in **Multiply by** to multiply all of the amounts in the CSV file. This can be useful if you want to make an approximate currency conversion.
   - **Only import since** defaults to the date you last reconciled the account. Clear it to import every transaction in the file.
5. Once you're happy with the settings, press **Import**.

![CSV Import](/img/import/import-csv@2x.webp)

## Manually Add Transactions

If desired, you can manually add transactions. This is the most work but allows you to manage accounts that may not work with any other importing mechanism.

1. Open the account to want to add transactions to.
2. Press the **Add New** button.
3. Fill out the transaction and press **Add**.

## Avoiding duplicate transactions

Actual will automatically try to avoid duplicate transactions. This works best with OFX/QFX files since they provide rich data about transactions. They provide an **id** that we can use to avoid importing duplicates.

After checking the **id**, Actual will look for transactions around the same date, with the same amount, and with a similar payee. If it thinks the transaction already exists, it will avoid creating a duplicate. This means you can manually enter a transaction, and later it will be matched when you import it from a file.

It will always favor the imported transaction. If it matches a manually-entered transaction, it will update the date to match the imported transaction. **Keeping dates in sync with your bank is important** as it allows you to compare the balance at any point in time with your bank.

When "Merge with existing transactions" is enabled, a **Reimport deleted transactions** checkbox is also available. When checked, any transactions that were previously imported and then deleted will be reimported. It is off by default. Your choice is remembered for each account.

:::note
The [API](../api/reference.md#importtransactions) defaults `reimportDeleted` to `true` for backward compatibility. If you are importing via the API and want to skip deleted transactions, pass `reimportDeleted: false` explicitly.
:::
