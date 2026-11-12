"""
Fetch market-driven valuation multiples and ~10y range percentiles.

Metric rules (what the market typically uses):
  - banks: P/TBV (else P/B)
  - serial acquirers / industrials / software: EV/EBITDA
  - if EV/EBITDA history is too thin for a range, percentile uses trailing P/E
    over ~10y while still reporting the spot EV/EBITDA

Percentile: 0 = at historical low of the range metric, 100 = at historical high.
"""
from __future__ import annotations

import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
COMPANIES = ROOT / "data" / "companies.json"
OUT = ROOT / "data" / "valuations.json"

YAHOO = {
    "CSU": "CSU.TO",
    "FSV": "FSV",
    "TFII": "TFII",
    "CIGI": "CIGI",
    "DSG": "DSGX",
    "BYD": "BYD.TO",
    "TOI": "TOI.V",
    "LMN": "LMN.V",
    "DE": "DE.V",
    "AEP": "AEP.V",
    "BRK.B": "BRK-B",
    "BG": "BG.VI",
    "OTP": "OTP.BD",
    "KRX": "KRX.IR",
    "SIKA": "SIKA.SW",
    "IMCD": "IMCD.AS",
    "DSV": "DSV.CO",
    "IP": "IP.MI",
    "MC": "MC.PA",
    "3697": "3697.T",
    "319A": "319A.T",
    "2884": "2884.T",
    "9166": "9166.T",
    "TPG": "TPG0.DE",
    "CCL.B": "CCL-B.TO",
    "NTG": "NTG.CO",
    "MBB": "MBB.DE",
    "CIE": "CIE.MC",
    "BRKN": "BRKN.SW",
    "SOL": "SOL.MI",
    "THEP": "THEP.PA",
    "SGN": "SGN.WA",
    "FAGR": "FAGR.BR",
    "CBF": "CBF.WA",
    "RELAIS": "RELAIS.HE",
    "TXT": "TXT.MI",
    "SES": "SES.MI",
    "SCHP": "SCHP.PA",
    "EQS": "EQS.PA",
    "CHG": "CHG.DE",
    "TEA": "TEA.AX",
    "CUP": "CUP.AX",
    "PFP": "PFP.AX",
    "IPG": "IPG.AX",
    "SRG": "SRG.AX",
    "KPG": "KPG.AX",
}


def _stockholm(t: str) -> str:
    t = t.replace(".B", "-B").replace(".A", "-A")
    return f"{t}.ST" if not t.endswith(".ST") else t


def yahoo_symbol(ticker: str, exchange: str = "", ibkr: str = "") -> str:
    t = (ticker or "").strip()
    if t in YAHOO:
        return YAHOO[t]
    ex = (exchange or "").upper()

    if "STOCKHOLM" in ex:
        return _stockholm(t)
    if "COPENHAGEN" in ex:
        return f"{t}.CO"
    if "HELSINKI" in ex:
        return f"{t}.HE"
    if "SWISS" in ex:
        return f"{t}.SW"
    if "AMSTERDAM" in ex:
        return f"{t}.AS"
    if "PARIS" in ex:
        return f"{t}.PA"
    if "BRUSSELS" in ex:
        return f"{t}.BR"
    if "DUBLIN" in ex:
        return f"{t}.IR"
    if "MADRID" in ex:
        return f"{t}.MC"
    if "ITALIANA" in ex or "MILAN" in ex:
        return f"{t}.MI"
    if "WARSAW" in ex:
        return f"{t}.WA"
    if "VIENNA" in ex:
        return f"{t}.VI"
    if "BUDAPEST" in ex:
        return f"{t}.BD"
    if "TOKYO" in ex:
        return f"{t}.T"
    if "XETRA" in ex or "FRANKFURT" in ex:
        return f"{t}.DE"
    if "ASX" in ex:
        return f"{t}.AX"
    if "LSE" in ex or "AIM" in ex:
        return f"{t}.L"
    if "TSXV" in ex or "VENTURE" in ex:
        return f"{t}.V"
    if "TSX" in ex:
        t2 = t.replace(".B", "-B").replace(".A", "-A")
        return f"{t2}.TO"
    if t.endswith(".B") or t.endswith(".A"):
        return _stockholm(t)
    return t


def choose_metric(company: dict) -> dict:
    segment = company.get("segment") or "acquirers"
    industry = (company.get("industry") or "").lower()
    model = (company.get("model") or "").lower()

    if segment == "banks" or industry == "banks":
        return {
            "id": "p_tbv",
            "label": "P/TBV",
            "why": "Bank consolidators are priced on tangible book value.",
        }
    if any(x in industry for x in ("software", "saas", "vms")) or "vms" in model:
        return {
            "id": "ev_ebitda",
            "label": "EV/EBITDA",
            "why": "Software serial acquirers are compared on EV/EBITDA.",
        }
    return {
        "id": "ev_ebitda",
        "label": "EV/EBITDA",
        "why": "Serial acquirers trade on EV/EBITDA vs private purchase multiples.",
    }


def percentile(current: float, low: float, high: float) -> float | None:
    if current is None or low is None or high is None:
        return None
    if high <= low:
        return 50.0
    return round(max(0.0, min(100.0, (current - low) / (high - low) * 100.0)), 1)


def series_stats(values: list[float]) -> dict | None:
    vals = [v for v in values if v is not None and math.isfinite(v) and v > 0]
    if len(vals) < 4:
        return None
    ordered = sorted(vals)
    return {
        "low": round(ordered[0], 2),
        "high": round(ordered[-1], 2),
        "median": round(ordered[len(ordered) // 2], 2),
        "n": len(vals),
    }


def _naive(idx) -> pd.DatetimeIndex:
    if getattr(idx, "tz", None) is not None:
        return idx.tz_localize(None)
    return idx


def _stmt_series(frames: list[pd.DataFrame], keys: list[str]) -> pd.Series:
    pieces = []
    for df in frames:
        if df is None or df.empty:
            continue
        for key in keys:
            if key in df.index:
                s = df.loc[key].dropna().astype(float)
                s.index = pd.to_datetime(s.index).tz_localize(None)
                pieces.append(s)
                break
    if not pieces:
        return pd.Series(dtype=float)
    out = pd.concat(pieces).groupby(level=0).last().sort_index()
    return out


def _price_scale(info: dict) -> float:
    """Yahoo quotes some UK names in pence (GBp) while statements are in pounds."""
    cur = (info or {}).get("currency") or ""
    if cur in ("GBp", "ILA", "ZAc"):
        return 0.01
    return 1.0


def _month_prices(ticker: yf.Ticker, scale: float = 1.0) -> pd.Series:
    hist = ticker.history(period="10y", interval="1mo", auto_adjust=True)
    if hist is None or hist.empty:
        return pd.Series(dtype=float)
    hist = hist.copy()
    hist.index = _naive(hist.index)
    return (hist["Close"].astype(float) * scale).dropna()


def _clean_multiples(values: list[float], spot: float | None = None) -> list[float]:
    """Drop nonsensical EV/EBITDA or P/E points from unit mismatches."""
    vals = [v for v in values if v is not None and math.isfinite(v) and v > 0]
    if len(vals) < 4:
        return vals
    ordered = sorted(vals)
    med = ordered[len(ordered) // 2]
    hi_cap = max(med * 5, (spot or med) * 5, 80)
    lo_cap = max(0.2, min(med / 5, (spot or med) / 5 if spot else med / 5))
    cleaned = [v for v in vals if lo_cap <= v <= hi_cap]
    return cleaned if len(cleaned) >= 4 else vals


def reconstruct_pe_history(ticker: yf.Ticker) -> tuple[list[float], pd.Timestamp | None, pd.Timestamp | None]:
    try:
        # Keep price and EPS in the same Yahoo quote units (do not scale GBp here).
        prices = _month_prices(ticker, scale=1.0)
        ed = ticker.get_earnings_dates(limit=80)
    except Exception:
        return [], None, None
    if prices.empty or ed is None or ed.empty or "Reported EPS" not in ed.columns:
        return [], None, None

    eps = ed[["Reported EPS"]].dropna().sort_index()
    eps.index = _naive(eps.index)
    out = []
    first = last = None
    for dt, price in prices.items():
        price = float(price)
        if price <= 0:
            continue
        past = eps[eps.index <= dt].tail(4)
        if len(past) < 4:
            continue
        ttm = float(past["Reported EPS"].sum())
        if ttm <= 0:
            continue
        out.append(price / ttm)
        first = first or dt
        last = dt
    return out, first, last


def reconstruct_ev_ebitda_history(ticker: yf.Ticker) -> tuple[list[float], pd.Timestamp | None, pd.Timestamp | None]:
    """Monthly EV/EBITDA using forward-filled TTM EBITDA, shares, and net debt."""
    try:
        info = ticker.info or {}
        scale = _price_scale(info)
        prices = _month_prices(ticker, scale=scale)
        q_inc = ticker.quarterly_income_stmt
        a_inc = ticker.income_stmt
        q_bs = ticker.quarterly_balance_sheet
        a_bs = ticker.balance_sheet
    except Exception:
        return [], None, None
    if prices.empty:
        return [], None, None

    ebitda_q = _stmt_series([q_inc], ["EBITDA", "Normalized EBITDA"])
    ebitda_a = _stmt_series([a_inc], ["EBITDA", "Normalized EBITDA"])

    ttm_points = {}
    q_dates = list(ebitda_q.index)
    for i, d in enumerate(q_dates):
        window = ebitda_q.iloc[max(0, i - 3) : i + 1]
        if len(window) >= 4:
            ttm_points[d] = float(window.sum())
    for d, v in ebitda_a.items():
        ttm_points.setdefault(d, float(v))
    if not ttm_points:
        return [], None, None
    ttm = pd.Series(ttm_points).sort_index()
    ttm = ttm[ttm > 0]
    if ttm.empty:
        return [], None, None

    shares = _stmt_series([q_bs, a_bs], ["Ordinary Shares Number", "Share Issued"])
    net_debt = _stmt_series([q_bs, a_bs], ["Net Debt"])
    debt = _stmt_series([q_bs, a_bs], ["Total Debt"])
    cash = _stmt_series(
        [q_bs, a_bs],
        ["Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments"],
    )
    if net_debt.empty and (not debt.empty or not cash.empty):
        aligned = pd.concat({"d": debt, "c": cash}, axis=1).sort_index().ffill()
        net_debt = aligned.get("d", 0).fillna(0) - aligned.get("c", 0).fillna(0)

    fallback_shares = float(info.get("sharesOutstanding") or 0) or None
    # Derive shares from marketCap / price when Yahoo omits sharesOutstanding (common on LSE)
    if not fallback_shares:
        mcap = info.get("marketCap")
        px = info.get("currentPrice") or info.get("regularMarketPrice")
        if mcap and px:
            fallback_shares = float(mcap) / (float(px) * scale)

    out = []
    first = last = None
    for dt, price in prices.items():
        price = float(price)
        if price <= 0:
            continue
        past_ttm = ttm[ttm.index <= dt]
        if past_ttm.empty:
            continue
        e = float(past_ttm.iloc[-1])
        if e <= 0:
            continue

        sh = fallback_shares
        if not shares.empty:
            past_sh = shares[shares.index <= dt]
            if not past_sh.empty and float(past_sh.iloc[-1]) > 0:
                sh = float(past_sh.iloc[-1])
        if not sh:
            continue

        nd = 0.0
        if not net_debt.empty:
            past_nd = net_debt[net_debt.index <= dt]
            if not past_nd.empty and math.isfinite(float(past_nd.iloc[-1])):
                nd = float(past_nd.iloc[-1])

        ev = price * sh + nd
        if ev <= 0:
            continue
        out.append(ev / e)
        first = first or dt
        last = dt
    return out, first, last


def reconstruct_ptbv_history(ticker: yf.Ticker) -> tuple[list[float], pd.Timestamp | None, pd.Timestamp | None]:
    try:
        info = ticker.info or {}
        scale = _price_scale(info)
        prices = _month_prices(ticker, scale=scale)
        q_bs = ticker.quarterly_balance_sheet
        a_bs = ticker.balance_sheet
    except Exception:
        return [], None, None
    if prices.empty:
        return [], None, None

    tbv = _stmt_series([q_bs, a_bs], ["Tangible Book Value", "Net Tangible Assets"])
    shares = _stmt_series([q_bs, a_bs], ["Ordinary Shares Number", "Share Issued"])
    if tbv.empty or shares.empty:
        return [], None, None

    out = []
    first = last = None
    for dt, price in prices.items():
        price = float(price)
        past_tbv = tbv[tbv.index <= dt]
        past_sh = shares[shares.index <= dt]
        if past_tbv.empty or past_sh.empty:
            continue
        t = float(past_tbv.iloc[-1])
        sh = float(past_sh.iloc[-1])
        if t <= 0 or sh <= 0:
            continue
        out.append(price / (t / sh))
        first = first or dt
        last = dt
    return out, first, last


def current_multiple(ticker: yf.Ticker, metric_id: str) -> tuple[float | None, str]:
    info = ticker.info or {}
    if metric_id == "ev_ebitda":
        v = info.get("enterpriseToEbitda")
        if v and v > 0:
            return float(v), "EV/EBITDA"
        pe = info.get("trailingPE") or info.get("forwardPE")
        if pe and pe > 0:
            return float(pe), "P/E (fallback)"
        return None, "EV/EBITDA"
    if metric_id == "p_tbv":
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        try:
            bs = ticker.balance_sheet
            if bs is not None and not bs.empty and price:
                col = bs.columns[0]
                if "Tangible Book Value" in bs.index:
                    tbv = float(bs.loc["Tangible Book Value", col])
                    shares = info.get("sharesOutstanding")
                    if tbv > 0 and shares and shares > 0:
                        return float(price) / (tbv / float(shares)), "P/TBV"
        except Exception:
            pass
        pb = info.get("priceToBook")
        if pb and pb > 0:
            return float(pb), "P/B (proxy)"
        return None, "P/TBV"
    pe = info.get("trailingPE") or info.get("forwardPE")
    return (float(pe), "P/E") if pe and pe > 0 else (None, "P/E")


def _years_span(first, last) -> float | None:
    if first is None or last is None:
        return None
    return round(max(0.0, (last - first).days / 365.25), 1)


def fetch_one(company: dict) -> dict:
    metric = choose_metric(company)
    sym = yahoo_symbol(company.get("ticker", ""), company.get("exchange", ""), company.get("ibkr", ""))
    result = {
        "id": company["id"],
        "symbol": sym,
        "metric": metric["id"],
        "metricLabel": metric["label"],
        "metricWhy": metric["why"],
        "spot": None,
        "spotLabel": metric["label"],
        "current": None,
        "low": None,
        "high": None,
        "median": None,
        "percentile": None,
        "years": None,
        "n": 0,
        "rangeMetric": metric["label"],
        "asOf": datetime.now(timezone.utc).date().isoformat(),
        "status": "ok",
    }
    try:
        t = yf.Ticker(sym)
        spot, spot_label = current_multiple(t, metric["id"])
        result["spot"] = round(spot, 2) if spot else None
        result["spotLabel"] = spot_label

        if metric["id"] == "p_tbv":
            hist, first, last = reconstruct_ptbv_history(t)
            range_label = "P/TBV"
            range_current = spot
            if len(hist) < 12:
                pe_hist, pe_first, pe_last = reconstruct_pe_history(t)
                pe_cur = (t.info or {}).get("trailingPE")
                if len(pe_hist) >= len(hist) and pe_cur and pe_cur > 0:
                    hist, first, last = pe_hist, pe_first, pe_last
                    range_label = "P/E"
                    range_current = float(pe_cur)
        else:
            hist, first, last = reconstruct_ev_ebitda_history(t)
            range_label = "EV/EBITDA"
            range_current = spot if spot_label == "EV/EBITDA" else None
            # Prefer ~10y P/E range when EV/EBITDA history is short
            if len(hist) < 24 or (_years_span(first, last) or 0) < 6:
                pe_hist, pe_first, pe_last = reconstruct_pe_history(t)
                pe_cur = (t.info or {}).get("trailingPE") or (t.info or {}).get("forwardPE")
                if pe_hist and pe_cur and pe_cur > 0 and (
                    len(pe_hist) > len(hist) or (_years_span(pe_first, pe_last) or 0) > (_years_span(first, last) or 0)
                ):
                    hist, first, last = pe_hist, pe_first, pe_last
                    range_label = "P/E"
                    range_current = float(pe_cur)

        hist = _clean_multiples(list(hist), spot=range_current)
        if range_current and range_current > 0:
            hist = list(hist) + [range_current]

        stats = series_stats(hist)
        result["rangeMetric"] = range_label
        result["current"] = round(range_current, 2) if range_current else result["spot"]
        result["years"] = _years_span(first, last)

        if stats and result["current"]:
            result.update(
                {
                    "low": stats["low"],
                    "high": stats["high"],
                    "median": stats["median"],
                    "n": stats["n"],
                    "percentile": percentile(result["current"], stats["low"], stats["high"]),
                }
            )
            # Keep displaying the market spot multiple even if range used P/E
            if result["spot"] is None:
                result["spot"] = result["current"]
                result["spotLabel"] = range_label
        elif result["spot"]:
            result["status"] = "current_only"
            result["current"] = result["spot"]
        else:
            result["status"] = "no_data"
    except Exception as e:
        result["status"] = f"error: {type(e).__name__}: {e}"
    return result


def main():
    companies = json.loads(COMPANIES.read_text(encoding="utf-8"))["companies"]
    rows = []
    for i, c in enumerate(companies, 1):
        print(f"[{i}/{len(companies)}] {c['id']} ({c.get('ticker')}) …", flush=True)
        rows.append(fetch_one(c))
        time.sleep(0.25)

    payload = {
        "updated": datetime.now(timezone.utc).date().isoformat(),
        "notes": (
            "Valuation % is where the range metric sits vs its own history "
            "(0% = low end, 100% = high end). Spot multiple is the market-driven "
            "metric for the business type (EV/EBITDA for most acquirers; P/TBV for banks). "
            "When EV/EBITDA history is short, the 10y bar uses trailing P/E."
        ),
        "valuations": {r["id"]: r for r in rows},
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    ok = sum(1 for r in rows if r.get("percentile") is not None)
    print(f"Wrote {OUT} — {ok}/{len(rows)} with percentiles")


if __name__ == "__main__":
    main()
