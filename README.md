# Al-Barakah Share

Build a complete, production-ready full-stack web application called "ShareeFund" using:

Next.js 14 (App Router) with TypeScript

Tailwind CSS + shadcn/ui + Lucide React icons

Supabase for authentication (email/password), PostgreSQL database, realtime, and Row Level Security (RLS)

jsPDF for PDF generation

date-fns for date handling

Responsive mobile-first design with clean Islamic-friendly UI (green + white theme)

The app has TWO user roles:

ADMIN: Full CRUD control over everything

MEMBER (User): Read-only access + can send "Deposit Request" or "Interest-Free Loan Request" for admin approval

Authentication:

Login page with toggle: "Admin Login" / "Member Login"

Admin can create new member accounts (sets email + password)

After login, show role-based dashboard

Logout button in header

Protected routes with RLS

Core Dashboard (both roles):

Top: Total Investment Amount + Available Balance (real-time)

Members list: Each member shows photo (uploadable), name, total deposited, % share ownership

Click any member → detailed history: month-wise deposit, profit received, withdrawal

Main Sections (Sidebar navigation):

MEMBERS / INVESTMENT SECTION

Admin: Add/edit deposits, approve member requests

Member: Send deposit request (amount + payment method + number) → goes to admin for approval

Profit sharing: Based on % ownership

Auto-calculate % share = (user deposit / total investment) * 100

FUND SECTION

In/Out transactions with reason, date, amount

Both roles can see full history

Admin only can add/edit

ISLAMIC LOAN SECTION (Qard-e-Hasana + Profit-based)

Admin only can create loan:

Unique Loan Code (auto-generated)

Purchase Price, Sell Price

Tenure: 3 months (8%), 6 months (16%), 12 months (25%) → auto-calculate total sell price & monthly installment

Assign Media Person (extra 5% profit + his own % share)

Phone number + WhatsApp one-click call button

Comments section

Remaining amount display

When loan closes: Profit distributed by % share (15% auto to FUND, rest to members). Media Person gets extra 5%.

Advance payment option (reduce principal, profit on remaining)

Admin can toggle and edit profit % globally

PROJECTS SECTION

Admin creates project + assigns Project Manager (from members)

Project Manager inputs: Expenses / Income with reason, comments, amount

Unique Project Code

When project closes: Calculate net profit → 15% auto to FUND, rest distributed by % share. Project Manager gets extra 5%.

Everyone sees full transaction list

MEMBER LOAN SECTION (Interest-Free)

Member can request interest-free loan from available balance

Admin approves → deduct from available balance

3-month deadline: If not fully repaid, auto-deduct from member's main balance

Member can pay in installments or lump sum

When sending payment, dropdown: "Installment" or "Loan Repayment" + medium + number

Extra Features (ALL required):

Monthly reminders:

1st & 2nd of every month: "New month started – please pay your installment"

15th of month: If no deposit, popup notification "You haven't deposited this month"

Monthly PDF Report (ADMIN ONLY):

Download button on dashboard

Contains: All members deposits, who didn't pay, Fund in/out, Islamic Loans status, Projects summary, total profit/loss

Every closed loan/project: Admin can download full detailed PDF

Member cannot download any PDF

Phone/WhatsApp one-click for all contacts (member, media person, project manager)

All calculations real-time and accurate

Proper error handling, loading states, toast notifications

Database Tables (create with Supabase):

users (id, role, name, email, photo, phone)

investments (member_id, amount, month, profit, withdrawal)

fund_transactions

islamic_loans (code, purchase_price, sell_price, tenure, installments, media_person_id, remaining)

projects (code, manager_id, expenses, incomes)

member_loans (request, approved_amount, repayments)

notifications (for reminders)

UI/UX:

Modern, clean, professional dashboard

Sidebar navigation

Dark/light mode optional but default light

Fully responsive (mobile friendly)

All numbers formatted with commas and BDT symbol (৳)

Start by creating the full project structure, Supabase integration, auth with roles, sidebar, and dashboard. Then implement all sections one by one. Make sure code is clean, commented, and ready for export to my own hosting (Vercel/Netlify/Render). Use Supabase client for all DB operations.

Generate the complete app now.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://cosbdofficial.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3f79a1f8-ae83-49ca-bc37-a4fd05aeca21).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
