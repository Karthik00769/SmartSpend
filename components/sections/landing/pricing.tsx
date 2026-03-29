import Link from 'next/link';
import { Button } from '@/components/ui/button';

const PLANS = [
  {
    name:     'Free',
    price:    '₹0',
    period:   'forever',
    desc:     'Perfect for getting started',
    features: ['Up to 50 expenses/month', '3 budget categories', 'Basic insights', 'Goal tracking (2 goals)'],
    cta:      'Get Started',
    href:     '/signup',
    highlight: false,
  },
  {
    name:     'Pro',
    price:    '₹299',
    period:   'per month',
    desc:     'For serious financial planners',
    features: ['Unlimited expenses', 'All budget categories', 'AI-powered insights', 'Unlimited goals', 'Receipt OCR scanning', 'Export reports'],
    cta:      'Start Free Trial',
    href:     '/signup',
    highlight: true,
  },
  {
    name:     'Enterprise',
    price:    'Custom',
    period:   'contact us',
    desc:     'For teams and businesses',
    features: ['Everything in Pro', 'Multi-user accounts', 'Priority support', 'Custom integrations', 'Dedicated account manager'],
    cta:      'Contact Sales',
    href:     '#contact',
    highlight: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-4 bg-background">
      <div className="max-w-6xl mx-auto">

        <div className="text-center mb-16">
          <span className="text-sm font-medium text-primary uppercase tracking-widest">Pricing</span>
          <h2 className="text-4xl font-bold text-foreground mt-2 mb-4">Simple, Transparent Pricing</h2>
          <p className="text-lg text-muted-foreground">Start free. Upgrade when you need more.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {PLANS.map(plan => (
            <div
              key={plan.name}
              className={`rounded-xl border p-8 flex flex-col gap-6 transition-all duration-200 ${
                plan.highlight
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10 scale-105'
                  : 'border-border bg-card hover:border-primary/30 hover:shadow-md'
              }`}
            >
              {plan.highlight && (
                <div className="text-center">
                  <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-widest">
                    Most Popular
                  </span>
                </div>
              )}

              <div>
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="text-muted-foreground text-sm mt-1">{plan.desc}</p>
              </div>

              <div>
                <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                <span className="text-muted-foreground text-sm ml-2">/ {plan.period}</span>
              </div>

              <ul className="space-y-3 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-primary mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link href={plan.href}>
                <Button
                  className="w-full"
                  variant={plan.highlight ? 'default' : 'outline'}
                >
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
