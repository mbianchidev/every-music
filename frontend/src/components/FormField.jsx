const FormField = ({ label, required, children }) => (
  <div>
    <label style={{ display: 'block', marginBottom: '0.5rem' }}>
      {label}{required && ' *'}
    </label>
    {children}
  </div>
);

export default FormField;
