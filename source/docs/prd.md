# Requirements Document

## 1. Application Overview
ShiftCup is a mobile-first scheduling application designed for single-location cafés and small restaurants. It streamlines the weekly scheduling routine: employees submit their availability, the system drafts the schedule using deterministic scheduling rules, managers review and adjust assignments, and employees receive shift notifications and reminders. Managers operate on a monthly subscription model, while employees access the application free of charge.

## 2. Users & Core Scenarios

### 2.1 Target Users
- **Manager**: Café owner or store manager responsible for café setup, team management, schedule generation, publishing, and subscription management.
- **Employee**: Café staff member invited to submit availability, view assigned shifts, and submit cover requests.
- **App Owner**: Platform administrator monitoring registered cafés and subscription status.

### 2.2 Core Scenarios
- **Café Onboarding & First Run**: A manager sets up a new café in three steps or launches a sample café in demo mode.
- **Availability Collection**: Manager sends a weekly availability request; employees submit weekday availability windows or managers paste text messages parsed by server-side AI.
- **Schedule Drafting & Fixing**: System fills open slots based on coverage blocks, employee skills, ratings, and availability; manager resolves gaps and clashes before publishing.
- **Shift Viewing & Cover Requests**: Employees view published shifts for the current and upcoming week and flag shifts they cannot attend.
- **Reminders & Billing**: System dispatches shift notifications and reminders according to café settings, while handling Stripe subscription and trial management.

## 3. Page Structure & Functional Descriptions

### 3.1 Directory Structure
```
ShiftCup App
├── Authentication & Onboarding
│   ├── Sign In
│   ├── Welcome & First Run
│   ├── Café Setup Flow
│   └── Sample Café Demo Screen
├── Manager Interface (Bottom Tabs)
│   ├── Today Tab
│   ├── Schedule Tab
│   │   ├── Slot Assignment Sheet
│   │   └── Queued Reminders Sheet
│   ├── Team Tab
│   │   ├── Member Detail / Edit
│   │   ├── Add / Invite Member
│   │   └── AI Message Parser Modal
│   └── Settings Tab
│       ├── Operating Hours & Coverage Blocks
│       ├── Routine & Reminder Settings
│       ├── Plan & Billing
│       ├── Legal & Support Pages (Privacy, Terms, Support)
│       └── Delete Account
├── Employee Interface
│   ├── My Shifts View
│   └── Submit Availability View
└── App Owner Interface
    └── Owner Admin Dashboard
```

### 3.2 Authentication & Onboarding
- **Sign In**:
  - Manager and Employee email/password sign-in.
  - Employee access validation via manager invite link activation.
  - Deactivated accounts are blocked from signing in.
- **Welcome & First Run**:
  - Displayed to new managers upon initial sign-in.
  - Action buttons: 「Set up my café」 and 「Explore a sample café」.
- **Café Setup Flow**:
  - Step 1: Input café name.
  - Step 2: Configure store opening and closing times.
  - Step 3: Input initial team member first names.
- **Sample Café Demo Screen**:
  - Pre-loads demo data with 7 sample employees.
  - Displays a persistent banner: 「You are exploring a sample café」.
  - Excluded from all billing mechanisms.

### 3.3 Manager Interface
- **Today Tab**:
  - Weekly progress bar tracking 4 stages: Ask, Draft, Fix gaps, Publish.
  - Current stage indicator with a primary action button for the next step.
  - Attention cards: Pending cover requests, unanswered availability requests, coverage gaps, and assignment clashes.
  - Weekly summary metrics: Total scheduled hours and projected total wage cost.
  - Active trial banner (when applicable): 「Free trial: X days left」.
- **Schedule Tab**:
  - Week selector with state status badge (Draft, Published, or Changed since published).
  - Action button: 「Approve and publish」.
  - Alert section listing gaps and clashes with dedicated 「Fix」 buttons.
  - Day selector displaying chronological coverage blocks per weekday.
  - Visual slot cards color-coded by role: Barista (Blue), Scooper (Pink), Solo (Green), Open slot (Dashed red outline).
  - Action controls: 「Fill open slots」, 「Copy last week」, 「Share as text」, and 「Clear this week」.
  - **Slot Assignment Sheet** (opens on slot tap):
    - List of team members ordered with eligible candidates first, displaying star rating and current week accumulated hours.
    - Ineligible candidates marked with specific constraint reasons.
    - Actions: 「Assign」, 「Assign anyway」 (active only for weekly hour limit overages), and 「Leave open」.
  - **Queued Reminders Sheet**:
    - Chronological list of scheduled notification dispatches associated with the published week.
- **Team Tab**:
  - Weekly request status list for all employees (Waiting, Answered, Unavailable) with 「Send request」 and 「Nudge」 actions.
  - Quick availability input area: manager pastes employee text message, triggers server-side AI parsing, displays parsed day chips, and confirms via 「Looks right, save it」.
  - Member roster: Displays member rating (adjustable via plus/minus buttons), role badges (Barista, Scooper, Back of house), 「Can work alone」 indicator, and 7-day availability strip (tap to edit).
  - Member management actions: Add member, edit profile, resend invite link, and deactivate member.
- **Settings Tab**:
  - General: Edit café name.
  - Schedule & Coverage Rules: Configure weekday store hours and coverage blocks (start time, end time, rule type: 「Solo allowed」 or 「Two people」).
  - Routine Times: Availability due day/time (default Wednesday 8 PM), schedule publish day (default Friday), evening-before reminder time (default 6 PM), second reminder offset (default 1 hour before shift), maximum shift duration (default 8 hours), notification delivery channel (email or text message).
  - Plan & Billing: Subscription status badge (Trial, Active, Past due, Ended), days remaining / next renewal date, action button (「Start subscription」 or 「Renew」), and 「Manage billing」 entry linking to billing portal.
  - Legal & Account: Links to Privacy Policy, Terms of Service, Support page (with support email), Account deletion action, and Sign out button.

### 3.4 Employee Interface
- **My Shifts View**:
  - Chronological list of assigned shifts for the current week and next week (displaying date, start/end time, and assigned role).
  - Shift action: 「I can't make it」 button to submit a cover request.
  - Notification reminder information banner indicating scheduled reminder timings.
- **Submit Availability View**:
  - Next week availability form with due date display.
  - Per-day availability selector: 「Any time」, 「Certain hours」 (start to end time input), or 「Not available」.
  - Submission button: 「Send my availability」.

### 3.5 App Owner Interface
- **Owner Admin Dashboard**:
  - Restricted administrative view for the platform owner.
  - Roster of all registered cafés detailing café name, subscription status, trial expiration date, and monthly recurring revenue summary.

## 4. Business Rules & Core Logic

### 4.1 Coverage Blocks & Slot Rules
1. A 「Solo allowed」 block contains a single 「Solo」 slot. It can only be filled by an employee marked with 「can work alone」 who possesses all three roles (Barista, Scooper, Back of house).
2. A 「Two people」 block contains two distinct slots: 「Barista」 and 「Scooper」. These must be filled by two separate individuals. A multi-skilled employee can only occupy one slot in that block.
3. Default coverage blocks for a store open 11:00 AM – 10:00 PM:
   - 11:00 AM – 2:00 PM: Solo allowed
   - 2:00 PM – 5:00 PM: Solo allowed
   - 5:00 PM – 8:00 PM: Solo allowed (Except Friday, Saturday, Sunday: Two people)
   - 8:00 PM – 10:00 PM: Solo allowed (Except Saturday, Sunday before 8:00 PM: Two people)

### 4.2 Slot Eligibility & Assignment Logic
1. **Eligibility Criteria**: An employee is eligible for a slot if and only if they meet all the following conditions:
   - Submitted availability for the current scheduling cycle (if a request was sent);
   - Marked available for the entire duration of the block;
   - Assigned the specific role required by the slot;
   - Not already assigned to another slot in the same block;
   - Has no approved or pending cover request for that day;
   - Adding the block does not exceed their maximum weekly hours limit;
   - The assignment results in a single continuous shift for that day (no split shifts allowed);
   - The resulting daily shift length does not exceed the configured maximum daily shift limit.
2. **Tie-Breaking Order**: Among multiple eligible candidates, the candidate with the highest star rating is assigned first. If ratings are equal, assignment goes to the candidate with the fewest scheduled hours in the active week.
3. **Automated Fill Behavior**: Triggering 「Fill open slots」 assigns only unoccupied slots and strictly preserves existing manual assignments.
4. **Gaps Identification**: A gap is defined as any unoccupied slot, any slot assigned to a deactivated employee, or any slot with an active cover request. Gaps are formatted as `[Day] [Start Time] to [End Time]: [Role] needed`. When a Barista is assigned in a Two people block with an empty Scooper slot, append: `A barista is on, but the scooper must be a second person.`
5. **Clashes Identification**: A clash is defined as an assigned employee who no longer meets eligibility constraints (e.g., modified availability, deactivation, or rule changes). The specific invalidation reason must be displayed.

### 4.3 AI Availability Parsing
- Server-side execution using OpenAI API with the secret key secured on the server.
- Extracts employee name and per-weekday availability windows (`Any time`, `Not available`, or `From–To` window) from unformatted text messages.
- If an employee mentions only specific days, all unmentioned days must default to `Not available`. Ambiguous inputs (e.g., \"maybe weekends\") must be flagged with an `unclear` tag without guessing times.
- Parsed availability requires explicit manager confirmation before database persistence.
- Restricted to authenticated managers on an active trial or paid plan. AI is strictly prohibited from making shift assignments directly.

### 4.4 Notifications & Reminders
- **Availability Request**: Dispatched when the manager initiates the weekly request.
- **Schedule Publication**: Dispatched to employees when the manager publishes the schedule, listing their assigned shifts.
- **Shift Reminders**:
  - Evening prior: Dispatched at the configured time (default 6:00 PM) stating: `You're scheduled to [role] tomorrow, [Start Time] to [End Time]`.
  - Shift day: Dispatched before the shift start (default 1 hour prior) stating: `Your [role] shift starts in one hour, at [Start Time]`.
  - Back-to-back shifts for an employee on the same day are merged into a single reminder pair.
  - Updates to published shifts invalidate and replace pending reminder queues.
  - Deactivating an employee immediately purges their pending reminders and marks affected shifts as gaps.

### 4.5 Subscription, Billing & Access Control
- **Pricing Model**: Flat rate of $29 per café per month for managers. Unlimited team members. Zero cost for employees.
- **Trial**: 14-day free trial upon café creation, granting full platform capabilities without initial credit card entry.
- **Payment Handling**: Stripe Checkout subscription. If recurring billing is unavailable, a 30-day single pass ($29) extends access by 30 days, triggering renewal emails 3 days prior to expiration. Billing status is updated exclusively via server-side Stripe webhooks.
- **Subscription Expiration / Delinquency**: If trial or plan expires, manager write access is suspended (cannot generate drafts, publish schedules, dispatch requests, use AI parsing, or trigger notifications). Managers retain view and payment access. Employees retain read-only access to the most recently published schedule.

## 5. Exceptions & Edge Cases

| Scenario | Trigger Condition | System Behavior |
| :--- | :--- | :--- |
| Deactivated Staff Member | Manager deactivates an employee profile | Revoke sign-in access immediately, cancel all queued reminders, flag all future assigned shifts as gaps with a deactivation alert. |
| Cover Request Submission | Employee taps 「I can't make it」 on a published shift | Flag the shift as a gap immediately on the manager's Today and Schedule views; retain original assignment until reassigned. |
| Hour Limit Override | Manager assigns an employee exceeding weekly hour limit via 「Assign anyway」 | Allow assignment override; flag warning badge on the slot and update total calculated payroll hours. |
| Conflicting Availability Change | Availability modified after shifts were drafted | Flag assigned slot as a clash on Today and Schedule tabs, displaying the exact conflicting condition. |
| Ambiguous AI Parsing | Raw text contains non-specific scheduling terms | Return day chips for clear days and mark ambiguous days as `unclear`; prompt manager to resolve manually before saving. |
| Plan Expiration | Café billing status transitions to Past due or Ended | Display top-level subscription expiration banner with a renewal action; lock draft generation and publishing actions. |

## 6. Acceptance Criteria

1. New managers can successfully complete the 3-step café setup or launch the sample café pre-populated with the 7 specified test profiles and an active exploration banner.
2. In the sample café, running the automated draft on default blocks results in exactly one unresolved gap on Friday 5:00 PM – 8:00 PM (Scooper needed), which resolves completely upon parsing and saving Jay's availability.
3. Shift slot assignment strictly validates single continuous shifts, daily maximum duration, weekly hour limits, role qualifications, and solo capability rules.
4. When multiple eligible candidates qualify for an open slot, the system automatically assigns the employee with the highest rating, resolving ties in favor of the candidate with fewer weekly assigned hours.
5. Employee role authentication strictly hides wage rates, team ratings, peer contact details, unpublished draft schedules, and billing controls from employee views.
6. Server-side text parsing processes availability input into structured weekday availability windows without guessing missing times and requires manager confirmation prior to saving.
7. Publishing a schedule generates an immutable snapshot and queues both evening-before and 1-hour-prior shift notifications according to configured routine timings.
8. Expired trials or lapsed subscriptions restrict manager write operations while preserving read-only schedule visibility for both managers and employees.

## 7. Out of Scope

- Multi-location café management or multi-unit organization hierarchies.
- In-app peer-to-peer shift swapping without manager intervention.
- Employee clock-in, clock-out, or live GPS geolocation time-tracking.
- Direct in-app payroll processing and automated bank disbursements.
- Customer-facing table reservations or food ordering capabilities.
