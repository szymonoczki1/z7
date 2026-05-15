// uzyj get items do wyswietlenia listy produktow
async function loadProducts() {
    try {
        const res = await fetch('/api/items');
        const items = await res.json();
        const tbody = document.getElementById('product-list');
        tbody.innerHTML = '';
        items.forEach(function (item) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + item.id + '</td><td>' + item.name + '</td><td>' + item.price + '</td>';
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Error loading products:', err);
    }
}

// przy submitowaniu formularza, uzyj post items do dodania produktu
document.getElementById('product-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const price = parseFloat(document.getElementById('price').value);
    try {
        const res = await fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, price: price })
        });
        if (res.ok) {
            document.getElementById('form-message').textContent = 'Product added!';
            document.getElementById('product-form').reset();
            loadProducts();
        }
    } catch (err) {
        document.getElementById('form-message').textContent = 'Error adding product.';
    }
});


loadProducts();
