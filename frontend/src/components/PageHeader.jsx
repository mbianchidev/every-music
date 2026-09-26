const PageHeader = ({ eyebrow, title, subtitle }) => (
  <header className="page-header">
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}
    <h1 className="heading-lg">{title}</h1>
    {subtitle && <p className="body-muted">{subtitle}</p>}
  </header>
);

export default PageHeader;
