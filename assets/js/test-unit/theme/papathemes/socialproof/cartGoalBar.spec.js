import {
    parseGoalItemsFromConfig,
    computeGoalBarState,
} from '../../../../theme/papathemes/socialproof/cartGoalBar';

describe('cartGoalBar helpers', () => {
    it('parseGoalItemsFromConfig filters invalid entries and sorts by amount', () => {
        const items = [
            { amount: 100, icon: 'discount', label: '10% Off' },
            { amount: 50, icon: 'shipping', label: 'Free Shipping' },
            { amount: 'bad', label: 'Invalid' },
            { amount: 150, icon: 'gift', label: 'Free Gift' },
            { amount: -10, label: 'Negative' },
            { amount: 75, label: '' },
            null,
        ];
        const parsed = parseGoalItemsFromConfig(items);
        expect(parsed).toHaveLength(3);
        expect(parsed[0].amount).toBe(50);
        expect(parsed[1].amount).toBe(100);
        expect(parsed[2].amount).toBe(150);
        // Invalid icon should be dropped to null
        const bogusIcon = parseGoalItemsFromConfig([
            { amount: 10, icon: 'notreal', label: 'Bogus' },
        ]);
        expect(bogusIcon[0].icon).toBeNull();
    });

    it('computeGoalBarState returns nextGoal and fillPct when subtotal < max', () => {
        const goals = [
            { amount: 50, label: 'Free Shipping' },
            { amount: 100, label: '10% Off' },
        ];
        const state = computeGoalBarState(goals, 30);
        expect(state.allMet).toBe(false);
        expect(state.nextGoal.amount).toBe(50);
        expect(state.fillPct).toBeCloseTo(30);
        expect(state.maxGoal).toBe(100);
    });

    it('computeGoalBarState returns allMet=true when subtotal >= max', () => {
        const goals = [{ amount: 50, label: 'Free Shipping' }];
        const state = computeGoalBarState(goals, 75);
        expect(state.allMet).toBe(true);
        expect(state.fillPct).toBe(100);
        expect(state.nextGoal).toBeNull();
    });

    it('computeGoalBarState caps fillPct at 100', () => {
        const goals = [{ amount: 50, label: 'A' }];
        expect(computeGoalBarState(goals, 9999).fillPct).toBe(100);
    });
});
