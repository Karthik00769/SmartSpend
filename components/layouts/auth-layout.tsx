export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground">SmartSpend</h1>
            <p className="text-muted-foreground text-sm mt-2">
              Plan Smart. Spend Wisely. Build Your Future.
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
