# ShiftCup QA report — Nov 14 (updated Nov 15)

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
| 11 | **Critical** | My shifts (employee) | An employee's own shifts were read from the manager's working draft, not the published week. After a week was published once, any later draft edit (moving someone, rebuilding the week) showed up on the employee's phone right away, before the manager published again. "My shifts" and "Whole team" could show different schedules. | My shifts now shows the published week only. Draft changes appear once the manager publishes again. "Ask for cover" on a shift the manager is changing explains that instead of pretending to send. |
| 12 | High | Team › Add member | Adding someone did not invite them. The invite only went out if the manager found and tapped "Share invite", so new people never joined and could not send availability or see shifts. | Adding someone with an email now emails the invite automatically (link plus code). With no email, the share sheet opens straight away. Adding or changing the email of someone who has not joined sends it again, and the Edit sheet has "Email the invite again". Joining cancels any invite still waiting. |
| 13 | High | Availability requests | People who had not joined still got "when can you work?" emails and nudges, with no way to answer: they had no account. | Those emails now include their join link and invite code. |
| 14 | **Critical** | Schedule, Today (manager) | One "I can't make it" request opened a gap on the same weekday of every week. A request for this Saturday made next Saturday (and the one after) look uncovered, and the draft builder treated that person as off. | A cover request now only affects its own week. Requests for weeks that are over no longer count. |
| 15 | High | Today (manager) | The red count on the Today tab included this week's cover requests, but the Today screen only listed next week's. The most urgent ones (a shift tomorrow) were counted and never shown. | Today lists every open cover request, this week first, and opens Schedule on that week. |
| 16 | High | Requests from the team | The manager was never told outside the app. "I can't make it" and availability change requests only raised the tab count, so a manager who did not open the app never knew. | The manager is emailed when someone asks for cover or sends an availability request (needs migration 00012). |
| 17 | Medium | Schedule › cover request | "Keep them on this shift" closed the request without telling the employee, who could assume they were off. | They are told by email that they are still on the shift. |
| 18 | Medium | My shifts (new employee) | After joining, nothing asked a new person for their usual week, so the manager had nothing to schedule them from. | A card on My shifts asks them to set their usual week, and shows when it is waiting for the manager. |

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
