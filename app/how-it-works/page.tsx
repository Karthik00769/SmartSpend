import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LandingNav } from '@/components/layout/LandingNav';
import { FooterSection } from '@/components/sections/landing/footer';

export const metadata = {
  title: 'How SmartSpend Works — Step-by-Step Guide',
  description: 'Learn how SmartSpend helps you track expenses, set budgets, define goals, and get AI-powered financial insights.',
};

const STEPS = [
  {
    step: '01',
    icon: '👤',
    title: 'Create Your Account',
    desc: 'Sign up in under 30 seconds using your email or Google account. No credit card required. Your data is encrypted from day one.',
    detail: 'Once signed in, you\'ll land on your personal dashboard — a clean overview of your financial health at a glance.',
    color: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
  },
  {
    step: '02',
    icon: '💸',
    title: 'Log Your Expenses',
    desc: 'Add expenses three ways: type them manually, scan a receipt with your camera (OCR), or import a bank/UPI statement.',
    detail: 'SmartSpend auto-categorises every expense using keyword matching — food, transport, utilities, entertainment, and more. You can always override the category.',
    color: 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
  },
  {
    step: '03',
    icon: '📋',
    title: 'Set Monthly Budgets',
    desc: 'Allocate a spending limit for each category. SmartSpend tracks your live spend against the limit and alerts you before you overshoot.',
    detail: 'Example: Set ₹5,000 for Food & Dining. When you hit ₹4,000 (80%), you\'ll see a warning so you can adjust before month-end.',
    color: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800',
  },
  {
    step: '04',
    icon: '🎯',
    title: 'Define Financial Goals',
    desc: 'Create savings goals — emergency fund, vacation, new laptop, home down payment. Set a target amount and deadline.',
    detail: 'SmartSpend calculates how much you need to save daily/monthly to hit your goal on time, and shows a live progress bar.',
    color: 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800',
  },
  {
    step: '05',
    icon: '🤖',
    title: 'Receive AI Insights',
    desc: 'After 2–4 weeks of data, SmartSpend\'s AI engine analyses your patterns and delivers personalised, actionable tips.',
    detail: 'Insights include: overspending alerts, savings opportunities, goal probability scores, unusual transaction flags, and monthly health scores.',
    color: 'bg-pink-50 dark:bg-pink-950/20 border-pink-200 dark:border-pink-800',
  },
];

const USE_CASE = {
  title: 'Real-Life Example: Tracking Monthly Food Expenses',
  steps: [
    { label: 'Week 1', text: 'Riya logs ₹1,200 at a restaurant and ₹800 at a grocery store. SmartSpend auto-tags both as "Food & Dining".' },
    { label: 'Week 2', text: 'She scans a Swiggy receipt — OCR extracts ₹450 and adds it instantly. Running total: ₹2,450.' },
    { label: 'Week 3', text: 'SmartSpend sends an alert: "You\'ve used 82% of your ₹3,000 food budget with 10 days left."' },
    { label: 'Week 4', text: 'Riya adjusts — cooks at home more. Month-end total: ₹2,980. Budget kept. Insight generated: "Great discipline this month!"' },
  ],
};

const PLACEHOLDERS = [
  { label: 'Dashboard Overview',   icon: '📊', desc: 'KPIs, spending ring, recent transactions' },
  { label: 'Add Expense Flow',     icon: '➕', desc: 'Manual entry form with auto-categorisation' },
  { label: 'Budget Tracker',       icon: '📋', desc: 'Category bars with live spend vs limit' },
  { label: 'Goals Progress',       icon: '🎯', desc: 'Goal cards with progress bars and daily targets' },
  { label: 'AI Insights Panel',    icon: '🤖', desc: 'Insight cards with tips and health score' },
  { label: 'Receipt OCR Scanner',  icon: '📷', desc: 'Camera capture and drag-drop upload' },
];

export default function HowItWorksPage() {
  return (
    <>
      <LandingNav />
      <main className="pt-16">

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="py-24 px-4 bg-gradient-to-br from-primary/5 via-background to-background text-center">
          <div className="max-w-3xl mx-auto">
            <span className="text-sm font-medium text-primary uppercase tracking-widest">Product Walkthrough</span>
            <h1 className="text-5xl font-bold text-foreground mt-3 mb-6 text-balance">
              How SmartSpend Works
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed mb-10">
              SmartSpend is a personal finance app that helps you understand where your money goes,
              stay within budget, and build towards your financial goals — all in one place.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg" className="px-8 hover:scale-105 transition-transform duration-200">
                  Get Started Free
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" size="lg" className="px-8">
                  ← Back to Home
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── Step-by-step workflow ─────────────────────────────────── */}
        <section className="py-24 px-4 bg-background">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-foreground mb-3">Five Steps to Financial Clarity</h2>
              <p className="text-muted-foreground">Follow this workflow to get the most out of SmartSpend.</p>
            </div>

            <div className="space-y-8">
              {STEPS.map((s, i) => (
                <div
                  key={s.step}
                  className={`rounded-xl border p-8 ${s.color} transition-all duration-200 hover:shadow-md`}
                >
                  <div className="flex items-start gap-5">
                    <div className="shrink-0 w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shadow">
                      {s.step}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{s.icon}</span>
                        <h3 className="text-xl font-semibold text-foreground">{s.title}</h3>
                      </div>
                      <p className="text-foreground/80 mb-3 leading-relaxed">{s.desc}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-3">
                        {s.detail}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Real-life use case ────────────────────────────────────── */}
        <section className="py-24 px-4 bg-muted/30">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-sm font-medium text-primary uppercase tracking-widest">Real-Life Example</span>
              <h2 className="text-3xl font-bold text-foreground mt-2 mb-3">{USE_CASE.title}</h2>
              <p className="text-muted-foreground">See how a real user — Riya — uses SmartSpend across a full month.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {USE_CASE.steps.map((s, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-6 hover:border-primary/30 hover:shadow-sm transition-all duration-200">
                  <div className="text-xs font-bold text-primary uppercase tracking-widest mb-2">{s.label}</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Visual walkthrough (image placeholders) ───────────────── */}
        <section className="py-24 px-4 bg-background">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-sm font-medium text-primary uppercase tracking-widest">Visual Walkthrough</span>
              <h2 className="text-3xl font-bold text-foreground mt-2 mb-3">See Every Screen</h2>
              <p className="text-muted-foreground">A preview of the key screens you'll use inside SmartSpend.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {PLACEHOLDERS.map(p => (
                <div key={p.label} className="group rounded-xl border border-border overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200">
                  {/* Placeholder image area */}
                  <div className="aspect-video bg-gradient-to-br from-primary/10 to-muted flex flex-col items-center justify-center gap-2">
                    <span className="text-5xl group-hover:scale-110 transition-transform duration-200">{p.icon}</span>
                    <span className="text-xs text-muted-foreground font-medium">{p.label}</span>
                  </div>
                  <div className="p-4 bg-card">
                    <p className="text-sm font-medium text-foreground">{p.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <section className="py-24 px-4 bg-primary text-primary-foreground text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-4xl font-bold mb-4">Ready to Start Saving?</h2>
            <p className="text-primary-foreground/80 text-lg mb-10 leading-relaxed">
              Join thousands of users who've taken control of their finances with SmartSpend.
              It's free to start — no credit card needed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button
                  size="lg"
                  className="px-10 bg-background text-foreground hover:bg-background/90 hover:scale-105 transition-all duration-200"
                >
                  Start Saving Now →
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="px-10 border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <FooterSection />
      </main>
    </>
  );
}
