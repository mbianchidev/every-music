const PageHeader = ({ title, subtitle }) => (
  <div style={{ padding: '2rem 0', borderBottom: '4px solid #F8F8F8', marginBottom: '2rem' }}>
    <h1 className="heading-lg">{title}</h1>
    {subtitle && <p style={{ opacity: 0.7 }}>{subtitle}</p>}
  </div>
);

export default PageHeader;
