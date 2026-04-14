'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export function HeroSection() {
  return (
    <section
      id="home"
      className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-background pt-32 pb-20 px-4"
    >
      <div className="max-w-6xl mx-auto text-center">

        

        <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6 text-balance leading-tight">
          Plan Smart.<br />Spend Wisely.<br />
          <span className="text-primary">Build Your Future.</span>
        </h1>

        <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
          Take control of your finances with intelligent expense tracking, smart budgeting,
          and goal-based planning. Turn awareness into action.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-20">
          <Link href="/signup">
            <Button size="lg" className="text-base px-8 shadow-lg hover:shadow-primary/25 hover:scale-105 transition-all duration-200">
              Get Started
            </Button>
          </Link>
          <Link href="/how-it-works">
            <Button variant="outline" size="lg" className="text-base px-8 hover:bg-muted/60 transition-all duration-200">
              Learn More →
            </Button>
          </Link>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap justify-center gap-8 mb-20 text-center">
          {[
            { value: '10k+', label: 'Active Users' },
            { value: '₹2Cr+', label: 'Expenses Tracked' },
            { value: '98%',   label: 'Satisfaction Rate' },
          ].map(stat => (
            <div key={stat.label}>
              <div className="text-3xl font-bold text-primary">{stat.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: '💰', title: 'Smart Budgeting',    desc: 'Set budgets and track spending by category in real-time' },
            { icon: '📊', title: 'Real-time Insights', desc: 'Visualize spending patterns and financial health instantly' },
            { icon: '🎯', title: 'Goal Planning',      desc: 'Define and track financial goals from vacation to homeownership' },
          ].map(card => (
            <div
              key={card.title}
              className="bg-card p-6 rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 group"
            >
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-200">{card.icon}</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{card.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
