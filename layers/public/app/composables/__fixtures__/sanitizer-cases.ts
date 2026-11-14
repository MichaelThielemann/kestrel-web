export interface SanitizerCase {
  title: string;
  input: string;
  output: string;
}

const PIXEL = "data:image/png;base64,iVBORw0KGgo=";

export const sanitizerCases: SanitizerCase[] = [
  { title: "forces noopener noreferrer on target=_BLANK and removes opener", input: '<a href="https://example.com" target="_BLANK" rel="opener">x</a>', output: '<a href="https://example.com" target="_BLANK" rel="noopener noreferrer">x</a>' },
  { title: "forces noopener noreferrer on a named browsing context", input: '<a href="https://example.com" target="win1">x</a>', output: '<a href="https://example.com" target="win1" rel="noopener noreferrer">x</a>' },
  { title: "adds the missing rel after the other attributes", input: '<a target="_blank" href="https://example.com">x</a>', output: '<a target="_blank" href="https://example.com" rel="noopener noreferrer">x</a>' },
  { title: "keeps other rel tokens next to the forced ones", input: '<a href="https://example.com" target="_blank" rel="nofollow opener">x</a>', output: '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">x</a>' },
  { title: "leaves target=_self and its rel alone", input: '<a href="https://example.com" target="_SELF" rel="opener">x</a>', output: '<a href="https://example.com" target="_SELF" rel="opener">x</a>' },
  { title: "leaves a link without a target alone", input: '<a href="https://example.com" rel="nofollow">x</a>', output: '<a href="https://example.com" rel="nofollow">x</a>' },
  { title: "drops a data: link", input: '<a href="data:text/html;base64,PHA+">x</a>', output: "<a>x</a>" },
  { title: "drops a protocol-relative link", input: '<a href="//host.example/x">x</a>', output: "<a>x</a>" },
  { title: "drops a link that starts with two backslashes", input: '<a href="\\\\host.example/x">x</a>', output: "<a>x</a>" },
  { title: "drops a link whose scheme hides behind a tab", input: '<a href="java&#9;script:alert(1)">x</a>', output: "<a>x</a>" },
  { title: "keeps relative, anchor, mailto, tel and kestrel links", input: '<a href="/de/team">a</a><a href="#top">b</a><a href="mailto:a@example.com">c</a><a href="tel:+4912345">d</a><a href="kestrel:page/1">e</a>', output: '<a href="/de/team">a</a><a href="#top">b</a><a href="mailto:a@example.com">c</a><a href="tel:+4912345">d</a><a href="kestrel:page/1">e</a>' },
  { title: "keeps a data: image source", input: `<img src="${PIXEL}" alt="dot">`, output: `<img src="${PIXEL}" alt="dot">` },
  { title: "drops a protocol-relative image source", input: '<img src="//host.example/a.png" alt="a">', output: '<img alt="a">' },
  { title: "drops an image source with a scheme outside the list", input: '<img src="ftp://host.example/a.png" alt="a">', output: '<img alt="a">' },
  { title: "drops attributes the tag does not carry", input: '<p href="https://example.com" src="x" colspan="2" data-x="1" aria-label="y" style="color:red">x</p>', output: "<p>x</p>" },
  { title: "keeps the attributes a table cell carries", input: '<table><tbody><tr><th scope="col" colspan="2">a</th><td rowspan="2">b</td></tr></tbody></table>', output: '<table><tbody><tr><th scope="col" colspan="2">a</th><td rowspan="2">b</td></tr></tbody></table>' },
  { title: "keeps the broken-link marker on a link", input: '<a href="/x" data-kestrel-broken="true">x</a>', output: '<a href="/x" data-kestrel-broken="true">x</a>' },
  { title: "drops the id of the site's own markup", input: '<div id="teleports" class="c" lang="de">x</div>', output: '<div class="c" lang="de">x</div>' },
];
