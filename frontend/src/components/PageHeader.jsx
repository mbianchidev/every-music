const PageHeader = ({ eyebrow, title, subtitle, actions }) => (
  <header className="page-header">
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="heading-lg">{title}</h1>
      {subtitle && <p className="body-muted">{subtitle}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>
);

export default PageHeader;
