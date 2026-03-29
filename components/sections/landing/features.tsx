const FEATURES = [
  { icon: '📱', title: 'Dual Expense Entry',   desc: 'Log expenses manually or upload receipts and statements. We handle the rest.' },
  { icon: '🔍', title: 'Category Insights',    desc: 'Understand where your money goes with detailed category breakdowns and trends.' },
  { icon: '📈', title: 'Budget Control',        desc: "Allocate budgets per category and get real-time alerts when you're overspending." },
  { icon: '🎯', title: 'Financial Goals',       desc: 'Set short and long-term goals and watch your progress with visual tracking.' },
  { icon: '📊', title: 'Smart Reports',         desc: 'Monthly summaries, health scores, and actionable insights for better decisions.' },
  { icon: '🔒', title: 'Bank-level Security',   desc: 'Your financial data is encrypted and protected with industry-leading security.' },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-4 bg-muted/30">
      <div className="max-w-6xl mx-auto">

        <div className="text-center mb-16">
          <span className="text-sm font-medium text-primary uppercase tracking-widest">What You Get</span>
          <h2 className="text-4xl font-bold text-foreground mt-2 mb-4">Powerful Features</h2>
          <p className="text-lg text-muted-foreground">Everything you need to manage your finances effectively</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="bg-card p-8 rounded-xl border border-border hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
            >
              <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-200">{f.icon}</div>
              <h3 className="text-xl font-semibold text-foreground mb-2">{f.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
