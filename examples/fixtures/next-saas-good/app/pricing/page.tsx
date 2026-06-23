export default function PricingPage() {
  const plans = [
    { name: 'Free', price: 0, features: ['1 project', 'Community support'] },
    { name: 'Pro', price: 29, features: ['Unlimited projects', 'Priority support'] },
    { name: 'Enterprise', price: 99, features: ['SSO', 'Dedicated support', 'SLA'] },
  ];

  return (
    <main>
      <h1>Pricing</h1>
      <div>
        {plans.map((plan) => (
          <div key={plan.name}>
            <h2>{plan.name}</h2>
            <p>${plan.price}/mo</p>
            <ul>
              {plan.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <a href={`/signup?plan=${plan.name.toLowerCase()}`}>Choose {plan.name}</a>
          </div>
        ))}
      </div>
    </main>
  );
}
