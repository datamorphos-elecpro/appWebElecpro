export default function Link({ children, href, ...props }: React.ComponentProps<'a'>) { return <a {...props} href={href}>{children}</a>; }
