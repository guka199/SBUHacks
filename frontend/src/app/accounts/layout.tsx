export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="account-page page-gutter">{children}</div>;
}
