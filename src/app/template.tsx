export default function RootTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="gvt-route-enter">{children}</div>;
}
