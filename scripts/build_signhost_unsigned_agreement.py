#!/usr/bin/env python3
"""Create the unsigned Signhost template from the approved agreement artwork.

The source PDF contains a final overlay with a historical handwritten signature.
This script removes that complete overlay content block instead of merely covering
the signature, so the result cannot reveal the old signature when edited.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject


SIGNATURE_OVERLAY_MARKER = b"\nq\n0.0 0.0 595.2756 841.8898 re\nW\nn\n"
SIGNATURE_XOBJECT = NameObject("/FormXob.edf35082acc3c16872083ee79456e2ad")


def build_unsigned(source: Path, destination: Path) -> None:
    reader = PdfReader(source)
    if len(reader.pages) != 9:
        raise ValueError(f"Expected 9 pages, found {len(reader.pages)}")

    signature_page = reader.pages[6]
    content = signature_page.get_contents().get_data()
    marker_count = content.count(SIGNATURE_OVERLAY_MARKER)
    if marker_count != 1:
        raise ValueError(f"Expected one signature overlay marker, found {marker_count}")

    clean_content = content.split(SIGNATURE_OVERLAY_MARKER, 1)[0].rstrip() + b"\n"
    stream = DecodedStreamObject()
    stream.set_data(clean_content)
    signature_page[NameObject("/Contents")] = stream

    resources = signature_page.get(NameObject("/Resources"))
    xobjects = resources.get(NameObject("/XObject")) if resources else None
    if xobjects and SIGNATURE_XOBJECT in xobjects:
        del xobjects[SIGNATURE_XOBJECT]

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    metadata = dict(reader.metadata or {})
    metadata.update(
        {
            "/Title": "Overeenkomst van opdracht - Zelfstandig salespartner - ongetekend Signhost-sjabloon",
            "/Subject": "Partner onboarding - ongetekend sjabloon partner_assignment_agreement_nl_v2",
        }
    )
    writer.add_metadata(metadata)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as output:
        writer.write(output)

    verify_unsigned(destination)


def verify_unsigned(path: Path) -> None:
    reader = PdfReader(path)
    page = reader.pages[6]
    content = page.get_contents().get_data()
    if SIGNATURE_OVERLAY_MARKER in content or b"/FormXob.edf35082acc3c16872083ee79456e2ad Do" in content:
        raise ValueError("Historical signature overlay is still present")
    if len(reader.pages) != 9 or reader.is_encrypted:
        raise ValueError("Unsigned PDF integrity check failed")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    build_unsigned(args.source, args.destination)


if __name__ == "__main__":
    main()
