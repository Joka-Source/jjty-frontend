import JSZip from 'jszip';
/** Generated publisher-like EPUB corpus; no external files or network inputs. */
export async function makeEpubFixture({version=3,layout='reflowable',direction='ltr',entries={},remove=[],compression='DEFLATE'}={}){
 const zip=new JSZip();zip.file('mimetype','application/epub+zip',{compression:'STORE'});
 const files={
  'META-INF/container.xml':'<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="Book/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  'Book/package.opf':`<package xmlns="http://www.idpf.org/2007/opf" version="${version}.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">jett-epub-fixture</dc:identifier><dc:title>Orchard पुस्तक</dc:title><dc:language>en</dc:language>${version===3?`<meta property="rendition:layout">${layout}</meta>`:''}</metadata><manifest><item id="one" href="chapters/one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="chapters/two.xhtml" media-type="application/xhtml+xml"/><item id="style" href="styles/book.css" media-type="text/css"/><item id="image" href="images/dot.png" media-type="image/png"/>${version===3?'<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>':'<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'}</manifest><spine${version===2?' toc="ncx"':''} page-progression-direction="${direction}"><itemref idref="one"/><itemref idref="two"/></spine></package>`,
  'Book/chapters/one.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Orchard</title><link rel="stylesheet" href="../styles/book.css"/></head><body><h1 id="opening">The orchard</h1><p>Read <em>carefully</em>, नमस्ते दुनिया.</p><img src="../images/dot.png" alt="A tiny dot"/><p><a href="two.xhtml#note">A footnote</a></p></body></html>',
  'Book/chapters/two.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>River</title></head><body><h1 id="river">The river</h1><p>Keep reading beside the river.</p><aside id="note"><p>Footnote text. <a href="one.xhtml#opening">Back</a></p></aside></body></html>',
  'Book/nav.xhtml':'<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapters/one.xhtml#opening">Orchard</a><ol><li><a href="chapters/two.xhtml#note">Footnote</a></li></ol></li><li><a href="chapters/two.xhtml#river">River</a></li></ol></nav></body></html>',
  'Book/toc.ncx':'<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap><navPoint id="a"><navLabel><text>Orchard</text></navLabel><content src="chapters/one.xhtml#opening"/><navPoint id="b"><navLabel><text>Footnote</text></navLabel><content src="chapters/two.xhtml#note"/></navPoint></navPoint><navPoint id="c"><navLabel><text>River</text></navLabel><content src="chapters/two.xhtml#river"/></navPoint></navMap></ncx>',
  'Book/styles/book.css':'body { color: #202020; } em { font-style: italic; }',
  'Book/images/dot.png':Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')),
  ...entries,
 };
 for(const [name,data]of Object.entries(files))if(!remove.includes(name))zip.file(name,data);
 for(const name of remove)zip.remove(name);
 return zip.generateAsync({type:'uint8array',compression});
}
