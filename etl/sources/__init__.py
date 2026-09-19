"""
The published documents ClaimCast reads, and where each one actually lives.

Finding these was most of the work, and the URLs are recorded here rather than
in a README because they are the thing that rots. Three notes matter more than
the list itself.

**A .pdf URL is not a PDF.** nha.gov.in answers a request for
img/resources/HBP-2.2-manual.pdf with HTTP 200 and 3.8 KB of HTML. The working
copy of the same document is on hem.nha.gov.in. This is why fetch.py checks the
bytes rather than the status code or the Content-Type header.

**A government host is not the issuing authority.** The CGHS rate list below
comes from delhijalboard.delhi.gov.in -- a Government of India domain
reproducing a CGHS Office Memorandum, not cghs.gov.in. The CGHS portal did not
resolve from here at all, and cghs.mohfw.gov.in serves a site banner-marked
"UAT Environment. For testing only, Not for production use." with the rate-list
links stubbed to javascript:void(0). So CGHS figures keep a caveat, and the
caveat says which copy the number came from.

**A document that mentions rates is not a rate list.** The only NHA file that
could be retrieved is the HBP 2.2 *User Guidelines*: 64 pages of scheme rules
that point at "Annexure 2: Packages and Rates" without containing it. Six
candidate URLs for the package master returned HTML stubs or 503, and
pmjay.gov.in refused the connection. PM-JAY package rates are therefore **not**
in this pipeline, and no figure on screen may claim to be one. The manual backs
the scheme's *rules* -- package periods, the unspecified-procedure cap, the
exclusion structure -- and nothing else.

That is the whole discipline: the gap gets written down, not papered over.
"""

from __future__ import annotations

from etl.fetch import Download

DOWNLOADS: list[Download] = [
    Download(
        key="vay-vandana-milestone-2024-11-17",
        source_id="nha-vay-vandana",
        url=(
            "https://static.pib.gov.in/WriteReadData/specificdocs/documents/2024/nov/"
            "doc20241118436001.pdf"
        ),
        kind="pdf",
        min_bytes=300_000,
        note=(
            "Press Information Bureau, 17 November 2024, 'Ayushman Bharat: Vay Vandana "
            "Cards achieves Milestone'. Confirms in the Government's own words: launched "
            "29 October 2024; 'universal and there is no income limit, whether poor or "
            "middle class or upper class'; age 70 and above. What it does not restate is "
            "that the cover is a separate five lakh on top of an existing family's PM-JAY "
            "cover rather than shared with it -- that mechanic is corroborated by policy "
            "analysis (Observer Research Foundation, 'Universalising Senior Care through "
            "PMJAY', Oct 2025) rather than found verbatim in this press note, and the "
            "source row says so rather than presenting it as equally primary."
        ),
    ),
    Download(
        key="cir-151-06-2020",
        source_id="irdai-cir-151-2020",
        url=(
            "https://irdai.gov.in/documents/37343/365525/"
            "Modified+Guidelines+on+Product+filing+in+Health+Insurance+Business-Norms+on.pdf/"
            "7b50effc-e553-f0a6-389d-3ca90ab11af5?version=1.0&t=1631531502137&download=true"
        ),
        kind="pdf",
        min_bytes=400_000,
        note=(
            "IRDAI/HLT/REG/CIR/151/06/2020, 11 June 2020, two pages. Confirmed verbatim: "
            "clause 4 excludes pharmacy and consumables, implants and medical devices, and "
            "diagnostics from 'associate medical expenses' -- the PROPORTIONATE clause's "
            "exemption list -- and clause 7 forbids proportionate deduction on ICU charges "
            "outright, which is PROPORTIONATE_ICU. Both were paraphrase before this fetch."
        ),
    ),
    Download(
        key="hbp-2.2-user-guidelines",
        source_id="nha-hbp-2-2",
        url="https://hem.nha.gov.in/HBP.pdf",
        kind="pdf",
        min_bytes=5_000_000,
        note=(
            "Health Benefit Package 2.2 USER GUIDELINES, National Health Authority. "
            "Scheme rules only -- package periods, limits and the exclusion "
            "structure. It refers to 'Annexure 2: Packages and Rates' but does not "
            "carry it, and no reachable NHA URL serves the package master, so this "
            "file backs no per-procedure rate. Served from hem.nha.gov.in; the "
            "nha.gov.in path for the same file returns an HTML error page under a "
            ".pdf URL."
        ),
    ),
    Download(
        key="modification-guidelines-2019",
        source_id="irdai-lists",
        url=(
            "https://irdai.gov.in/documents/37343/365525/"
            "Modification+Guidelines+on+Standardization+in+Health+Insurance.pdf/"
            "c11bdea3-aef4-b638-6501-296ccc372ef2?version=1.1&t=1665917813498&download=true"
        ),
        kind="pdf",
        min_bytes=1_000_000,
        note=(
            "IRDAI/HLT/REG/CIR/176/09/2019, 27 September 2019. Replaces Annexure I "
            "of the 2016 standardization guidelines with Lists I-IV: the optional "
            "items a patient pays for, and the items subsumed into room charges, "
            "procedure charges and treatment costs."
        ),
    ),
    Download(
        key="master-circular-standardization-2020",
        source_id="arogya-sanjeevani",
        url=(
            "https://irdai.gov.in/documents/37343/366029/"
            "Master+Circular+on+Standardization+of+Health+Insurance+Products.pdf/"
            "40548736-71a8-1b76-e28d-0df899407e1e?version=1.2&t=1665033878433&download=true"
        ),
        kind="pdf",
        min_bytes=1_000_000,
        note=(
            "IRDAI/HLT/REG/CIR/193/07/2020, 22 July 2020. 155 pages consolidating "
            "every standardization guideline in force at 31 March 2020, including "
            "the Arogya Sanjeevani standard product wording and the four lists."
        ),
    ),
    Download(
        key="hbp-2022-om",
        source_id="nha-hbp-2022",
        url=(
            "https://cdnbbsr.s3waas.gov.in/s3169779d3852b32ce8b1a1724dbf5217d/"
            "uploads/2024/06/20240619792610196.pdf"
        ),
        kind="pdf",
        min_bytes=4_000_000,
        note=(
            "MIRROR, NOT THE ISSUING AUTHORITY. The HBP 2022 Office Memorandum, "
            "National Health Authority: the package master the 2.2 User "
            "Guidelines reference as 'Annexure 2: Packages and Rates' and do not "
            "contain. 1,893 package codes with a National Reference Price and "
            "separate Tier 3, Tier 2 and Tier 1 prices, which is the same grid "
            "shape as the CGHS schedule. Served from the Haryana State Health "
            "Agency's copy on the NIC government CDN, because nha.gov.in answers "
            "every path with the same 3,843-byte HTML shell and pmjay.gov.in "
            "refuses the connection. Haryana republishes the national memorandum; "
            "it does not issue it, so the rates are real and the chain of custody "
            "runs through a state agency."
        ),
    ),
    Download(
        key="master-circular-2024",
        source_id="irdai-master-circular-2024",
        url=(
            "https://irdai.gov.in/documents/37343/991022/%E0%A4%B8%E0%A5%8D%E0%A4%B5%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A5%E0%A5%8D%E0%A4%AF+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%B5%E0%A4%B8%E0%A4%BE%E0%A4%AF+%E0%A4%AA%E0%A4%B0+%E0%A4%AE%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%9F%E0%A4%B0+%E0%A4%AA%E0%A4%B0%E0%A4%BF%E0%A4%AA%E0%A4%A4%E0%A5%8D%E0%A4%B0-%E0%A4%85%E0%A4%82%E0%A4%97%E0%A5%8D%E0%A4%B0%E0%A5%87%E0%A4%9C%E0%A5%80+_+Master+Circular+on+Health+Insurance+Business+-English.pdf/08a32828-dc1d-116f-0549-6db86d448651?version=1.0&t=1719833433399&download=true"
        ),
        kind="pdf",
        min_bytes=500_000,
        note=(
            "IRDAI/HLT/CIR/PRO/84/5/2024, 29 May 2024, Master Circular on Health "
            "Insurance Business, English text. Fetched alongside its annexure to "
            "read one thing in the document's own words: what Annexure-6 is a "
            "list of. Annexure-6 names the 2020 Master Circular on "
            "Standardization, which is where the Arogya Sanjeevani terms in this "
            "database are quoted from, so whether that list means 'repealed' or "
            "'consolidated' decides how those clauses must be labelled."
        ),
    ),
    Download(
        key="master-circular-2024-annexure",
        source_id="irdai-master-circular-2024",
        url=(
            "https://irdai.gov.in/documents/37343/991022/%E0%A4%B8%E0%A5%8D%E0%A4%B5%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A5%E0%A5%8D%E0%A4%AF+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%B5%E0%A4%B8%E0%A4%BE%E0%A4%AF+%E0%A4%AA%E0%A4%B0+%E0%A4%AE%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%9F%E0%A4%B0+%E0%A4%AA%E0%A4%B0%E0%A4%BF%E0%A4%AA%E0%A4%A4%E0%A5%8D%E0%A4%B0+29052024+%E0%A4%95%E0%A4%BE+%E0%A4%85%E0%A4%A8%E0%A5%81%E0%A4%AC%E0%A4%82%E0%A4%A7+_+Annexure+to+Master+circualr+on+Health+Insurance+Business+29052024.pdf/e65501d8-2731-6f5c-aaed-658f961289e1?version=2.0&t=1717051485494&download=true"
        ),
        kind="pdf",
        min_bytes=800_000,
        note=(
            "Annexure to IRDAI/HLT/CIR/PRO/84/5/2024, 29 May 2024, the Master "
            "Circular on Health Insurance Business. The circular itself is "
            "process and turnaround times; this annexure is where the schedules "
            "live, including the current standing of the non-payable lists. "
            "Fetched to settle one question: ClaimCast's priced basket of items "
            "the family pays is attributed to this circular, but three of those "
            "items sit in Lists II and IV of the 2019 guidelines, which say the "
            "hospital may not bill them separately at all. Whichever way this "
            "document answers, the answer is load-bearing for a figure on screen."
        ),
    ),
    Download(
        key="cghs-om-2025-10-03",
        source_id="cghs-rates",
        url=(
            "https://delhijalboard.delhi.gov.in/sites/default/files/Jalboard/"
            "universal-tab/new_cghs_rates_applicable.pdf"
        ),
        kind="pdf",
        min_bytes=500_000,
        note=(
            "MIRROR, NOT THE ISSUING AUTHORITY. CGHS Office Memorandum "
            "F.No. 5-16/CGHS(HQ)/HEC/2024(PartI), dated 3 October 2025, effective "
            "13 October 2025, issued 'in supersession of all previous memoranda' -- "
            "so this is the current national schedule, not a city-specific or "
            "historical list. 124 pages; Annexure I carries 1,998 coded rates with "
            "non-NABH, NABH and super-speciality columns. Circulated by the Delhi "
            "Jal Board because the CGHS portal did not resolve and its replacement "
            "is banner-marked a test environment, so this is the closest to source "
            "that could be reached."
        ),
    ),
    Download(
        key="ki-health-75th",
        source_id="nsso-75-health",
        url=(
            "https://www.mospi.gov.in/sites/default/files/publication_reports/"
            "KI_Health_75th_Final.pdf"
        ),
        kind="pdf",
        min_bytes=3_000_000,
        note=(
            "NSS Report KI(75/25.0), Key Indicators of Social Consumption in India: "
            "Health, covering July 2017 - June 2018. Served by the issuing ministry "
            "itself, which is rare enough in this manifest to be worth recording. "
            "This is the only source in ClaimCast that says what Indian households "
            "actually paid a private hospital, and it is the calibration target for "
            "the cost model. It is a survey of households, not a tariff, and it "
            "reports means over strata rather than individual bills."
        ),
    ),
    Download(
        key="cpi-2018-01",
        source_id="mospi-cpi-health",
        url="https://www.mospi.gov.in/sites/default/files/press_release/CPI_PR_12feb18m.pdf",
        kind="pdf",
        min_bytes=200_000,
        note=(
            "CPI press release of 12 February 2018, carrying the January 2018 index. "
            "Annexure I gives sub-group 6.1.02 Health on base 2012=100. January 2018 "
            "is the month the NSS 75th round's field period straddles at its midpoint, "
            "so this is the deflator's near end."
        ),
    ),
    Download(
        key="cpi-2025-12",
        source_id="mospi-cpi-health",
        url=(
            "https://www.mospi.gov.in/uploads/latestReleases/"
            "latest_release_1768213461321_53cd35fd-1bbc-4b43-b92d-8fb67474ee74_"
            "Press_Release_of_CPI_for_December_2025.pdf"
        ),
        kind="pdf",
        min_bytes=500_000,
        note=(
            "CPI press release of 12 January 2026, carrying the December 2025 index. "
            "This is the LAST month published on base 2012=100: the January 2026 "
            "release rebases the whole series to 2024=100, and splicing the two needs "
            "a linking factor MoSPI publishes separately. Stopping here keeps both "
            "ends of the deflator on one base and costs no assumption."
        ),
    ),
]

BY_SOURCE: dict[str, list[Download]] = {}
for _d in DOWNLOADS:
    BY_SOURCE.setdefault(_d.source_id, []).append(_d)
