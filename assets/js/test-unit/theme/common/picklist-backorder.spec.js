import PicklistBackorder from '../../../theme/common/picklist-backorder';

const CONTEXT = {
    quantityBackorderedMessage: '__QTY__ will be backordered',
    showBackorderMessage: true,
    backorderMessages: [
        { id: 1, message: 'Dispatches within 2 weeks' },
        { id: 2, message: 'Store default', is_default: true },
    ],
};

function mountScope() {
    $('body').append(`
        <div class="scope">
            <div data-product-attribute="product-list">
                <label class="form-label">RAM: <small>Required</small></label>
                <label data-product-attribute-value="101" for="attribute_select_101"></label>
            </div>
            <ul data-picklist-backorder-list style="display:none;"></ul>
        </div>
    `);

    return $('.scope');
}

function makeData(overrides = {}) {
    return {
        selected_picklist_options: [
            { attribute_value_id: 101, product_id: 55, auto_adjust_inventory_flag: true },
        ],
        picklist_products_details: [
            {
                product_id: 55,
                is_stock_tracked: true,
                purchasable: true,
                available_on_hand: 2,
                available_for_backorder: 10,
                available_to_sell: 12,
                backorder_message_id: 1,
            },
        ],
        ...overrides,
    };
}

describe('PicklistBackorder.render', () => {
    let $scope;

    beforeEach(() => { $scope = mountScope(); });
    afterEach(() => { $('body').empty(); });

    it('lists the backordered quantity and message for a selected option', () => {
        const picklist = new PicklistBackorder($scope, CONTEXT);
        picklist.render(makeData(), 5);

        const $items = $('[data-picklist-backorder-list] li', $scope);
        expect($items.length).toBe(1);
        // 5 requested - 2 on hand = 3 backordered
        expect($items.text()).toBe('RAM: 3 will be backordered | Dispatches within 2 weeks');
    });

    it('renders nothing when the requested qty fits the option\'s on-hand stock', () => {
        const picklist = new PicklistBackorder($scope, CONTEXT);
        picklist.render(makeData(), 2);

        expect($('[data-picklist-backorder-list] li', $scope).length).toBe(0);
        expect($('[data-picklist-backorder-list]', $scope).css('display')).toBe('none');
    });

    it('caps the backordered qty at the option\'s available_for_backorder', () => {
        const data = makeData();
        data.picklist_products_details[0].available_for_backorder = 1;
        const picklist = new PicklistBackorder($scope, CONTEXT);
        picklist.render(data, 9);

        expect($('[data-picklist-backorder-list] li', $scope).text()).toContain('1 will be backordered');
    });

    it('ignores options whose inventory is not auto-adjusted', () => {
        const data = makeData();
        data.selected_picklist_options[0].auto_adjust_inventory_flag = false;
        const picklist = new PicklistBackorder($scope, CONTEXT);
        picklist.render(data, 9);

        expect($('[data-picklist-backorder-list] li', $scope).length).toBe(0);
    });

    it('ignores options that are not stock tracked', () => {
        const data = makeData();
        data.picklist_products_details[0].is_stock_tracked = false;
        const picklist = new PicklistBackorder($scope, CONTEXT);
        picklist.render(data, 9);

        expect($('[data-picklist-backorder-list] li', $scope).length).toBe(0);
    });

    it('omits the quantity line when showQuantityOnBackorder is false', () => {
        const picklist = new PicklistBackorder($scope, { ...CONTEXT, showQuantityOnBackorder: false });
        picklist.render(makeData(), 5);

        expect($('[data-picklist-backorder-list] li', $scope).text()).toBe('RAM: Dispatches within 2 weeks');
    });

    it('falls back to the store default backorder message', () => {
        const data = makeData();
        data.picklist_products_details[0].backorder_message_id = 99;
        const picklist = new PicklistBackorder($scope, CONTEXT);
        picklist.render(data, 5);

        expect($('[data-picklist-backorder-list] li', $scope).text()).toContain('Store default');
    });

    it('rerender reuses the last response with a new quantity', () => {
        const picklist = new PicklistBackorder($scope, CONTEXT);
        picklist.render(makeData(), 3);
        picklist.rerender(6);

        expect($('[data-picklist-backorder-list] li', $scope).text()).toContain('4 will be backordered');
    });
});

describe('PicklistBackorder.getSellLimitViolation', () => {
    let $scope;

    beforeEach(() => { $scope = mountScope(); });
    afterEach(() => { $('body').empty(); });

    it('reports the option that runs out first', () => {
        const picklist = new PicklistBackorder($scope, CONTEXT);
        picklist.render(makeData(), 1);

        expect(picklist.getSellLimitViolation(13)).toEqual({ name: 'RAM', availableToSell: 12 });
    });

    it('returns null while the requested qty fits', () => {
        const picklist = new PicklistBackorder($scope, CONTEXT);
        picklist.render(makeData(), 1);

        expect(picklist.getSellLimitViolation(12)).toBeNull();
    });

    it('returns null for an option with unlimited backorder', () => {
        const data = makeData();
        data.picklist_products_details[0].unlimited_backorder = true;
        const picklist = new PicklistBackorder($scope, CONTEXT);
        picklist.render(data, 1);

        expect(picklist.getSellLimitViolation(9999)).toBeNull();
    });

    it('returns null before any option-change response has arrived', () => {
        const picklist = new PicklistBackorder($scope, CONTEXT);

        expect(picklist.getSellLimitViolation(10)).toBeNull();
    });
});
