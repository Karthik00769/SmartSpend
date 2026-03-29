import Link from 'next/link';
import { Button } from '@/components/ui/button';

const STEPS = [
  {
    step: '01',
    icon: '👤',
    title: 'Create Your Account',
    desc: 'Sign up in seconds. No credit card required. Connect with Google or use email.',
  },
  {
    step: '02',
    icon: '💸',
    title: 'Log Your Expenses',
    desc: 'Add expenses manually, scan receipts with OCR, or import bank statements automatically.',
  },
  {
    step: '03',
    icon: '📋',
    title: 'Set Monthly Budgets',
    desc: 'Allocate spending limits per category — food, transport, entertainment, and more.',
  },
  {
    step: '04',
    icon: '🎯',
    title: 'Define Financial Goals',
    desc: 'Set savings targets like an emergency fund, vacation, or new laptop. Track progress daily.',
  },
  {
    step: '05',
    icon: '🤖',
    title: 'Get AI Insights',
    desc: 'SmartSpend analyses your patterns and delivers personalised tips to improve your finances.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 px-4 bg-background">
      <div className="max-w-6xl mx-auto">

        <div className="text-center mb-16">
          <span className="text-sm font-medium text-primary uppercase tracking-widest">Simple Process</span>
          <h2 className="text-4xl font-bold text-foreground mt-2 mb-4">How SmartSpend Works</h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            From sign-up to financial clarity in five straightforward steps.
          </p>
        </div>

        <div className="relative">
          {/* Vertical connector line (desktop) */}
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-border -translate-x-1/2" />

          <div className="space-y-12">
            {STEPS.map((s, i) => (
              <div
                key={s.step}
                className={`relative flex flex-col md:flex-row items-center gap-8 ${
                  i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                }`}
              >
                {/* Content card */}
                <div className="flex-1 bg-card border border-border rounded-xl p-6 hover:border-primary/30 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{s.icon}</span>
                    <span className="text-xs font-bold text-primary/60 tracking-widest uppercase">Step {s.step}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">{s.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>

                {/* Center dot */}
                <div className="hidden md:flex w-10 h-10 rounded-full bg-primary text-primary-foreground items-center justify-center text-sm font-bold shrink-0 z-10 shadow-md">
                  {s.step}
                </div>

                {/* Spacer for alternating layout */}
                <div className="flex-1 hidden md:block" />
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-16">
          <Link href="/how-it-works">
            <Button variant="outline" size="lg" className="hover:bg-muted/60 transition-all duration-200">
              See Full Walkthrough →
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
