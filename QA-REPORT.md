# ShiftCup QA report — Nov 14

Tested on the iPhone 18 Pro Max simulator (iOS 27.2, Expo Go) as the manager and as an
employee of the test café "QA Test Kitchen". Android was reviewed in code, not on a device.

## Bugs fixed

| # | Severity | Where | Bug | Fix |
|---|----------|-------|-----|-----|
| 1 | High | Every pop-up sheet | The grab handle suggests swiping down to close, but swiping did nothing. Only the X closed it. | Drag the handle or title down to close, with a spring back on a short drag. Works on Android too (own gesture root inside the Modal). |
| 2 | High | Settings, Me | "Sign out" signed out on a single tap, with no confirmation. | Native "Sign out?" dialog (iOS alert, Android dialog, browser confirm on web). |
| 3 | Medium | Sign-in, every form field | The field outline was switched with style classes on focus or error. That can rebuild the native input mid-typing, which matches the lost/misplaced text seen in testing. | Fixed classes; only the border colour changes, as a plain style. |
| 4 | Medium | Settings | Changing a day, time or reminder saved silently. No sign it worked. | "Saved" confirmation after each change. |
| 5 | Medium | Team › Add/Edit member | iOS number pads have no Return key, so the keyboard could not be closed from the hours/wage fields. A wage typed as "15,50" saved as $0. Hours could be 0 or 999. | Keyboard with a Done key on iOS; comma decimals accepted; hours kept between 1 and 80. |
| 6 | Low | Schedule | "Reminders queued" listed every reminder (6 cards per person, about 60 for 10 staff). | One summary line ("6 reminders scheduled for 1 person") with Show/Hide. |
| 7 | Low | Sign-in | The red error stayed on screen while you retyped. | The error clears as soon as you edit a field. |
| 8 | Low | Schedule › Gaps | Gap text sat at the top of the card, out of line with the Fix button. | Centered. |
| 9 | Medium | Team | The "changed for this week only" dot showed on days that only re-confirmed the usual week (Ana had 5 dots, no real changes). | The dot and its caption appear only when a day really differs from the usual week. |
| 10 | Low | Availability (employee) | The one-week change card only mentioned next week, though up to 3 weeks ahead is allowed. | Wording now says "up to 3 weeks ahead". |

## Checked and working
- Sign-in: empty fields, wrong password message, Return moves to the next field, iOS offers to save the password.
- Today, Schedule (status, summary, gaps, whole-week grid), shift picker explains why nobody fits.
- Employee: next-shift card, date tiles, whole-team tab, availability with usual week and requests.
- Android back button closes sheets (Modal `onRequestClose`).

## Not a bug, but note
- In the simulator, long strings typed by the test tool arrive late and land in the wrong place. Typing in short pieces works, so this is the tool, not the app. Check once on a real phone.

## Still open (suggestions)
- Settings is long: 6 full swipes to reach Sign out. Fold the 7 days of shift blocks into one collapsible section.
- Today shows all 4 steps ticked when a week is published with open slots. It could keep "Fix gaps" unticked.
- Add "Discard changes?" when closing a half-filled sheet.
