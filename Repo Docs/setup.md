# OpenHabits Metrics Setup

Start by logging one metric successfully. Add timers, reminders, or focus protection whenever you want them.

You need a Google account and, for the provided phone interface, an iPhone with Apple Shortcuts. Scriptable is needed only for iOS focus protection. Notion, Calendar Alarms, desktop blocking, and third-party blocking apps are optional.

## 1. Copy the starter Sheet

Open the **Starter Google Sheet** from [Downloads](downloads.md) and make your own copy. It includes the bound Apps Script and three example metrics:

| Metric | Try it with |
| --- | --- |
| Started Day | A tap that records the current time |
| Glasses of Water | A tap that adds one glass |
| Focused Work | A timer that adds the elapsed duration |

Use your own copy for tracking. The **Tracking Data** tab holds your history; **OpenHabits → Open OpenHabits** opens its settings panel.

<details>
<summary>Install manually, or prepare the Sheet before the copy link is published</summary>

1. Create a Google Sheet. Open **Extensions → Apps Script**.
2. Create these script files and paste their complete repository sources: [Main.gs](../Main.gs), [Config.gs](../Config.gs), [Lockouts.gs](../Lockouts.gs), and [SetupV2.gs](../SetupV2.gs).
3. Create HTML files named **SetupV2Launcher** and **SetupV2Styles**, using [SetupV2Launcher.html](../SetupV2Launcher.html) and [SetupV2Styles.html](../SetupV2Styles.html). Apps Script adds the `.html` extension.
4. Save the project. Run **openHabitsShowLauncher** once and authorize it, then reload the Sheet.
5. In the OpenHabits panel, select [starter-config.json](../Examples/starter-config.json) under **Or choose a configuration backup**, then choose **Save and Apply**. This creates the tracking tab and required metric/points/streak rows.

The JSON is configuration for the Sheet; the starter Sheet itself is distributed through a Google Sheets copy link.

</details>

## 2. Connect the web app

1. Open **Extensions → Apps Script → Project Settings**. Set the project timezone to your local timezone.
2. Under **Script properties**, add **OPENHABITS_SECRET** with a long random value. Keep it for the next step. A script bound to this Sheet does not need a spreadsheet ID property.
3. Choose **Deploy → New deployment → Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**, so Shortcuts can call it without an interactive Google sign-in. Authorize when prompted, then deploy.
4. Copy the **deployment ID**. It is the portion between `/s/` and `/exec` in the web app URL:

   `https://script.google.com/macros/s/DEPLOYMENT_ID/exec`

This secret is required. Each user deploys their own copy. See [Google's deployment instructions](https://developers.google.com/apps-script/guides/web) if the options differ for your account.

## 3. Install the phone shortcuts

1. Install **Insights** and **Log Started Day** from the separate [iOS 27](downloads.md#ios-27-and-newer) or [iOS 26](downloads.md#ios-26) download section.
2. Run **Insights** without input. Enter the same **Secret** and **Web App Id** from step 2, then choose **I'm Finished**.
3. Open **Log Started Day** in the Shortcut editor. If its **Run Shortcut** action is not connected, reselect **Insights**. Imported shortcuts can display a name while retaining a stale connection.

Insights submits recording requests and displays feedback. Its connection settings are shared by your loggers; you do not need to enter credentials in each one.

## 4. Verify one recording

Run **Log Started Day**, approve the requested permissions, and check today's **Started Day** cell in the Sheet. It should contain a timestamp. This starter keeps the first timestamp of the day, so a second tap leaves it unchanged.

Next, install **Log Water** and tap it twice. Today's **Glasses of Water** value should become `2`. For the timer example, continue to [Track time](guides/timers.md).

If the cells do not update, use [Troubleshooting](guides/maintenance.md#troubleshooting) before adding more features.

## Make it yours

In the Sheet panel, choose **Copy Current Configuration**, then **Open Config Editor**. Choose **Load Copied Configuration** in the editor and customize your metrics. When finished, choose **Finish and Copy for OpenHabits**, paste the result into the Sheet panel, and choose **Save and Apply**.

New primary and supporting rows are created automatically. Configuration changes take effect without redeploying the web app. If you use iOS blocking, run **Update Lockout Cache** afterward.

Choose what you want to do next in the [Feature guides](features.md). You can use logging alone indefinitely.
