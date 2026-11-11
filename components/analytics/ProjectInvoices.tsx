'use client';
import { useState } from 'react';
import type { PreviewFile } from '../../lib/project-reporting';
import { FilePreview } from '../projects/FilePreview';
import styles from './ProjectInvoices.module.css';

export function ProjectInvoiceNames({ invoices }: { invoices: PreviewFile[] }) {
  return invoices.length ? <ul className={styles.list}>{invoices.map((file) => <li key={file.id}>{file.original_name}</li>)}</ul> : <span>Sin facturas</span>;
}

export function ProjectInvoices({ invoices }: { invoices: PreviewFile[] }) {
  const [selected, setSelected] = useState<PreviewFile | null>(null);
  return <>{invoices.length ? <ul className={styles.list}>{invoices.map((file) => <li key={file.id}><button type="button" onClick={() => setSelected(file)}>{file.original_name}</button></li>)}</ul> : <span>Sin facturas</span>}
    {selected && <FilePreview key={selected.id} file={selected} onClose={() => setSelected(null)} />}</>;
}
