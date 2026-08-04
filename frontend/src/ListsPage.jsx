import { useState } from "react";

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

export default function ListsPage({
  lists,
  onCreateList,
  onRenameList,
  onDeleteList,
  onRemoveItem,
  onAddAllToCart,
  activeStoreName
}) {
  const [newListName, setNewListName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  function handleCreate(event) {
    event.preventDefault();
    const trimmed = newListName.trim();
    if (!trimmed) {
      return;
    }
    onCreateList(trimmed);
    setNewListName("");
  }

  function startRename(list) {
    setEditingId(list.id);
    setEditName(list.name);
  }

  function saveRename(listId) {
    const trimmed = editName.trim();
    if (!trimmed) {
      return;
    }
    onRenameList(listId, trimmed);
    setEditingId(null);
    setEditName("");
  }

  return (
    <section className="listsPage">
      <h2>Shopping Lists</h2>
      <p>
        Save named lists of staples
        {activeStoreName ? ` and add them to your ${activeStoreName} cart` : " and add them to your cart"}{" "}
        in one tap.
      </p>

      <form className="listsCreateForm" onSubmit={handleCreate}>
        <input
          type="text"
          value={newListName}
          onChange={(event) => setNewListName(event.target.value)}
          placeholder="e.g. Weekly staples"
          aria-label="New list name"
        />
        <button type="submit" className="checkoutBtn listsCreateBtn">
          Create list
        </button>
      </form>

      {lists.length === 0 ? (
        <p className="listsEmpty">No lists yet. Create one to start saving items.</p>
      ) : (
        <ul className="listsGrid">
          {lists.map((list) => {
            const items = Object.values(list.items || {});
            const itemCount = items.reduce((sum, item) => sum + (item.qty || 1), 0);
            const isEditing = editingId === list.id;

            return (
              <li key={list.id} className="listsCard">
                <div className="listsCardTop">
                  <div className="listsCardMeta">
                    {isEditing ? (
                      <div className="listsRenameRow">
                        <input
                          type="text"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          aria-label="Rename list"
                        />
                        <button
                          type="button"
                          className="secondaryBtn listsRenameSave"
                          onClick={() => saveRename(list.id)}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <h3>
                        {list.name}
                        <button
                          type="button"
                          className="listsRenameToggle"
                          onClick={() => startRename(list)}
                          aria-label={`Rename ${list.name}`}
                        >
                          Edit
                        </button>
                      </h3>
                    )}
                    <p className="listsCount">
                      {itemCount} item{itemCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="cartsHubDelete"
                    onClick={() => onDeleteList(list.id)}
                    aria-label={`Delete ${list.name}`}
                  >
                    Delete list
                  </button>
                </div>

                {items.length === 0 ? (
                  <p className="listsCardEmpty">No items yet — bookmark products from a store.</p>
                ) : (
                  <ul className="listsItemRows">
                    {items.map((item) => (
                      <li key={item.id} className="cartDrawerItem">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="cartDrawerThumb" />
                        ) : (
                          <div className="cartDrawerThumbPlaceholder" />
                        )}
                        <div className="cartDrawerItemBody">
                          <span className="cartDrawerItemName">{item.name}</span>
                          <strong>{currency(item.price)}</strong>
                          <button
                            type="button"
                            className="cartsHubDelete"
                            onClick={() => onRemoveItem(list.id, item.id)}
                            aria-label={`Remove ${item.name}`}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  className="checkoutBtn"
                  onClick={() => onAddAllToCart(list.id)}
                  disabled={items.length === 0}
                >
                  Add all to cart
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
