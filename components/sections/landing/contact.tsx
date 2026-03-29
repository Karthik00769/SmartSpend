'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ContactSection() {
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Placeholder — wire to your email API
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <section id="contact" className="py-24 px-4 bg-muted/30">
      <div className="max-w-2xl mx-auto text-center">

        <span className="text-sm font-medium text-primary uppercase tracking-widest">Get In Touch</span>
        <h2 className="text-4xl font-bold text-foreground mt-2 mb-4">Contact Us</h2>
        <p className="text-lg text-muted-foreground mb-12">
          Have a question or want to learn more? We'd love to hear from you.
        </p>

        {sent ? (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-8">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-green-800 dark:text-green-400 font-medium">Message sent! We'll get back to you within 24 hours.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-8 space-y-4 text-left">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Name</label>
                <Input placeholder="Your name" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input type="email" placeholder="you@example.com" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Message</label>
              <textarea
                required
                rows={4}
                placeholder="How can we help?"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
              />
            </div>
            <Button type="submit" className="w-full">Send Message</Button>
          </form>
        )}
      </div>
    </section>
  );
}
