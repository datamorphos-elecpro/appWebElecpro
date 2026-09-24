'use client';

import { SearchList } from './SearchList';

export function MultiFilter({ label, values, options, onChange }: { label: string; values: string[]; options: { value: string; label: string }[]; onChange: (values: string[]) => void }) {
  return <div className="multiFilter"><span>{label}</span><SearchList label={label} values={values} options={options} onChange={onChange} multiple /></div>;
}
