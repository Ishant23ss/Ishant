// script.js

// Function to sort dates in descending order (newest first)
function sortDatesDescending(dates) {
    return dates.sort((a, b) => new Date(b) - new Date(a));
}

// Function to search for items based on a query
function searchItems(items, query) {
    return items.filter(item => item.toLowerCase().includes(query.toLowerCase()));
}

// Function to edit amounts manually
function editAmount(amount) {
    // Assume amount is an object with { id, value }
    const editedAmount = {...amount};
    editedAmount.value = prompt('Enter new amount:', editedAmount.value);
    return editedAmount;
}

// Example usage
const dates = ['2022-03-19', '2023-03-19', '2021-03-19'];
const sortedDates = sortDatesDescending(dates);
console.log('Sorted Dates:', sortedDates);

const items = ['apple', 'banana', 'cherry'];
const searchResult = searchItems(items, 'an');
console.log('Search Result:', searchResult);

const amount = { id: 1, value: 100 };
const updatedAmount = editAmount(amount);
console.log('Updated Amount:', updatedAmount);