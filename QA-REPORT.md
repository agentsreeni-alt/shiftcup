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
| 19 | **Critical** | Today (manager) | Today said "Ready to draft" and offered "Build the draft" as soon as one person had a usual week. A café with 10 people, none joined and 7 with no usual week was told it was ready. Nothing showed who was invited, who joined, or who still owed a usual week. | Today now starts with "Get your team ready": how many can be scheduled, who is at which step (not invited, invited, joined with no usual week, waiting for approval, ready), and one button that opens a list with the next action per person. Drafting only becomes the main step when the team is ready; "draft now with the N who are ready" stays as a smaller option. |
| 20 | High | Team | The status chip only said "Usual week" or "No usual week". There was no way to ask a joined person for their usual week, and no sign of whether an invite had been emailed. | Each person shows their step. The same setup card and list are at the top of Team. Joined people with no usual week have an "Ask them" button. The invite box says when the invite was emailed. |
| 21 | Low | Today › requests | A first usual week was labelled "wants a new usual week". | It reads "sent their usual week", with a note that approving it makes them schedulable. |
| 22 | **Critical** | Sharing invites (phone) | "Share" in the "Get your team ready" list opened the system share sheet from inside another sheet. iOS will not show a sheet over a sheet, so nothing happened. | Every invite now has its own buttons: Text, WhatsApp, Email app, Copy (and More, which closes the sheet first). They open that app with the message written, so they work over any sheet. |
| 23 | **Critical** | Sharing invites (computer) | Browsers on a computer have no share sheet: the invite was silently copied, with no way to choose how to send it. | Same buttons on every device. A clear "copied" message when copying, and copying as a fallback if an app cannot open. |
| 24 | **Critical** | Invite link | The join page was only reachable when signed out. Opening an invite link on a phone or browser where anyone was signed in (often the manager testing it) went nowhere. | The link always opens. If someone is signed in, it says who and offers "Sign out and join" with the code kept. |
| 25 | High | Joining with an existing account | Someone who already had a ShiftCup account (for example from tapping "Start free" by mistake) could not join: "That email already has an account". | They enter that account's password and are joined with it, as long as it does not run a café (needs the updated join function deployed). |
| 26 | Medium | Team | Invites sent by text or WhatsApp were not recorded, so people stayed "Not invited yet". | Any way of sending marks them "Invited, not joined". |
| 27 | Medium | Schedule › Share as text | It only showed the schedule text, with no way to send or copy it. | Text, WhatsApp, Email app and Copy buttons. |
| 28 | **Critical** | Sending invites on the website | Text and Email opened the message link in a new browser tab. Browsers silently drop app links opened that way, so nothing opened, yet the row said "Shared just now" with a tick. WhatsApp opened a WhatsApp page that refuses some browsers. | Text and Email now hand over to Messages and Mail directly from the tap. WhatsApp opens the app on phones and WhatsApp Web on computers. Phones on the website also get "Share invite…" (the system share sheet). |
| 29 | High | Invite status | Any tap was reported as "Shared", and the Send button disappeared, so there was no way to try again. | The line under the buttons says what really happened ("Messages should open… Nothing opened? Use Copy", "Copied", or why it failed). Send stays available; only an invite ShiftCup emailed itself is marked done. Text is hidden on computers that cannot send texts. |
| 30 | **Critical** | Sending invites on phones (website) | Text, WhatsApp and Email still did nothing on some phones. The buttons asked the browser to open the app from a script, which iPhones (and ShiftCup added to the home screen) often ignore. | They are now real links that the phone opens itself: tapping Text on an iPhone opens Messages with the invite written. Copy works during the tap on every browser. If something still fails, the full invite appears to press and copy. |
| 31 | Medium | Get your team ready list | After sending someone their invite, their row jumped down to the "invited" group, away from the buttons just used. | The list keeps its order while it is open. |

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
