export interface SelectedItem {
  name: string;
  rate: number;
  description?: string;
  sku?: string;
}

type ZohoItemInput = HTMLInputElement | HTMLTextAreaElement;

function setInputValue(element: ZohoItemInput, value: string | number): void {
  const prototype = element instanceof HTMLInputElement
    ? window.HTMLInputElement.prototype
    : window.HTMLTextAreaElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (
    element.disabled ||
    element.readOnly
  ) {
    return;
  }

  if (valueSetter) {
    valueSetter.call(element, String(value));
  } else {
    element.value = String(value);
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

/** Populates the focused Zoho item field and matching details in its table row. */
export const injectSelectedItemIntoZoho = (
  item: SelectedItem,
  target?: ZohoItemInput | null
): boolean => {
  const activeElement = target === undefined ? document.activeElement : target;

  if (
    !(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) ||
    activeElement.disabled ||
    activeElement.readOnly
  ) {
    return false;
  }

  setInputValue(activeElement, item.name);

  const currentRow = activeElement.closest('tr');
  if (!currentRow) {
    return true;
  }

  const rateInput = currentRow.querySelector<ZohoItemInput>(
    'input.line-item-rate, input[name*="rate" i], input[aria-label*="rate" i], input[placeholder*="rate" i]'
  );
  if (rateInput && rateInput !== activeElement) {
    setInputValue(rateInput, item.rate);
  }

  if (item.description) {
    const descriptionInput = currentRow.querySelector<ZohoItemInput>(
      'textarea[name*="description" i], input[name*="description" i], textarea[aria-label*="description" i], input[aria-label*="description" i], textarea[placeholder*="description" i], input[placeholder*="description" i]'
    );
    if (descriptionInput && descriptionInput !== activeElement) {
      setInputValue(descriptionInput, item.description);
    }
  }

  return true;
};