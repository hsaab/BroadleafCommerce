import { Decimal } from "./money.js";
export function estimateShipping(request) {
    return {
        currency: request.currency,
        estimates: request.options.map((option) => estimateOption(request.fulfillmentGroup.items, option)),
    };
}
function estimateOption(items, option) {
    if (option.type === "FIXED_PRICE") {
        const price = Decimal.parse(option.price);
        return {
            optionId: option.optionId,
            name: option.name,
            amount: price.toMoneyString(),
            explanation: {
                strategy: option.type,
                basisTotal: "0.00",
                flatRateTotal: "0.00",
                notes: ["Fixed-price fulfillment option uses the configured option price."],
            },
        };
    }
    if (option.type === "BANDED_WEIGHT") {
        return estimateBandedWeightOption(items, option);
    }
    return estimateBandedPriceOption(items, option);
}
function estimateBandedPriceOption(items, option) {
    const totals = calculateCandidateTotals(items, option);
    const selectedBand = totals.hasBandCandidate ? selectPriceBand(option.bands, totals.retailTotal) : undefined;
    const bandAmount = selectedBand?.bandAmount ?? Decimal.zero();
    const amount = bandAmount.add(totals.flatTotal);
    const notes = ["Selected highest qualifying band minimum."];
    if (selectedBand?.duplicateMinimumSelected) {
        notes.push("Duplicate band minimums qualified; selected the cheaper result.");
    }
    if (totals.flatTotal.compare(Decimal.zero()) > 0) {
        notes.push("Added item flat rates and excluded those items from the band basis.");
    }
    if (!selectedBand) {
        notes.push("No configured band matched; legacy behavior returns zero before flat rates.");
    }
    return {
        optionId: option.optionId,
        name: option.name,
        amount: amount.toMoneyString(),
        explanation: {
            strategy: option.type,
            basisTotal: totals.retailTotal.toMoneyString(),
            flatRateTotal: totals.flatTotal.toMoneyString(),
            matchedBand: selectedBand?.matchedBand,
            notes,
        },
    };
}
function estimateBandedWeightOption(items, option) {
    const totals = calculateCandidateTotals(items, option);
    const selectedBand = totals.hasBandCandidate ? selectWeightBand(option.bands, totals.weightTotal) : undefined;
    const bandAmount = selectedBand ? Decimal.parse(selectedBand.matchedBand.resultAmount) : Decimal.zero();
    const amount = bandAmount.add(totals.flatTotal);
    const notes = ["Selected highest qualifying weight band minimum."];
    if (selectedBand?.duplicateMinimumSelected) {
        notes.push("Duplicate band minimums qualified; selected the cheaper result.");
    }
    if (totals.flatTotal.compare(Decimal.zero()) > 0) {
        notes.push("Added item flat rates and excluded those items from the band basis.");
    }
    if (!selectedBand) {
        notes.push("No configured band matched; legacy behavior returns zero before flat rates.");
    }
    return {
        optionId: option.optionId,
        name: option.name,
        amount: amount.toMoneyString(),
        explanation: {
            strategy: option.type,
            basisTotal: totals.weightTotal.toDecimalString(),
            flatRateTotal: totals.flatTotal.toMoneyString(),
            matchedBand: selectedBand?.matchedBand,
            notes,
        },
    };
}
function calculateCandidateTotals(items, option) {
    return items.reduce((totals, item) => {
        const flatRate = option.useFlatRates ? findFlatRate(item, option.optionId) : undefined;
        if (flatRate) {
            return {
                ...totals,
                flatTotal: totals.flatTotal.add(Decimal.parse(flatRate.amount)),
            };
        }
        return {
            retailTotal: totals.retailTotal.add(itemTotal(item)),
            weightTotal: totals.weightTotal.add(itemWeight(item)),
            flatTotal: totals.flatTotal,
            hasBandCandidate: true,
        };
    }, {
        retailTotal: Decimal.zero(),
        weightTotal: Decimal.zero(),
        flatTotal: Decimal.zero(),
        hasBandCandidate: false,
    });
}
function selectPriceBand(bands, retailTotal) {
    return selectBand(bands, retailTotal, (band) => Decimal.parse(band.minimumAmount), (band) => calculateBandAmount(band.resultAmount, band.resultAmountType, retailTotal));
}
function selectWeightBand(bands, weightTotal) {
    return selectBand(bands, weightTotal, (band) => Decimal.parse(band.minimumWeight), (band) => Decimal.parse(band.resultAmount));
}
function selectBand(bands, basisTotal, minimumForBand, amountForBand) {
    let selected;
    for (const band of bands) {
        const bandMinimum = minimumForBand(band);
        if (basisTotal.compare(bandMinimum) < 0) {
            continue;
        }
        const bandAmount = amountForBand(band);
        const currentSelection = {
            bandMinimum,
            bandAmount,
            matchedBand: {
                minimum: bandMinimum.toMoneyString(),
                resultAmount: band.resultAmount,
                resultAmountType: band.resultAmountType,
            },
            duplicateMinimumSelected: false,
        };
        if (!selected) {
            selected = currentSelection;
            continue;
        }
        if (selected.bandMinimum.compare(bandMinimum) === 0 && bandAmount.lessThanOrEqual(selected.bandAmount)) {
            selected = {
                ...currentSelection,
                duplicateMinimumSelected: true,
            };
            continue;
        }
        if (bandMinimum.compare(selected.bandMinimum) > 0) {
            selected = currentSelection;
        }
    }
    return selected;
}
function calculateBandAmount(resultAmount, resultAmountType, retailTotal) {
    const parsedResultAmount = Decimal.parse(resultAmount);
    if (resultAmountType === "PERCENTAGE") {
        return retailTotal.multiply(parsedResultAmount);
    }
    return parsedResultAmount;
}
function itemTotal(item) {
    if (item.totalItemAmount) {
        return Decimal.parse(item.totalItemAmount);
    }
    return Decimal.parse(item.unitPrice ?? "0").multiply(Decimal.parse(String(item.quantity)));
}
function itemWeight(item) {
    if (!item.weight) {
        return Decimal.zero();
    }
    return convertWeightToPounds(Decimal.parse(item.weight.amount), item.weight.unit).multiply(Decimal.parse(String(item.quantity)));
}
function convertWeightToPounds(weight, unit) {
    if (unit === "OUNCES") {
        return weight.multiply(Decimal.parse("0.0625"));
    }
    if (unit === "KILOGRAMS") {
        return weight.multiply(Decimal.parse("2.2046226218"));
    }
    return weight;
}
function findFlatRate(item, optionId) {
    return item.flatRates?.find((flatRate) => flatRate.optionId === optionId);
}
