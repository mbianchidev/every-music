import { Fragment } from 'react';

// Places React nodes into a translated template such as "Posted by {name} on
// {date}", so each language keeps its own word order around links and times.
export function richText(template, parts) {
  return template.split(/(\{\w+\})/g).map((piece, index) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    return <Fragment key={index}>{name && Object.hasOwn(parts, name) ? parts[name] : piece}</Fragment>;
  });
}
