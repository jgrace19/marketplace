import { useState } from "react";

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

export default function ListsPage({
  lists,
  activeListId,
  activeStoreName,
  notice,
  onCreate,
  onRename,
  onDelete,
  onSelect,
  onRemoveItem,
  onAddAll
}) {
  const [draftName, setDraftName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const activeList = lists.find((list) => list.id === activeListId) || null;

  function submitCreate(event) {
    event.preventDefault();
    if (onCreate(draftName)) {
      setDraftName("");
    }
  }

  function startRename(list) {
    setEditingId(list.id);
    setEditingName(list.name);
  }

  function submitRename(event) {
    event.preventDefault();
    if (!editingId) {
      return;
    }
    if (onRename(editingId, editingName)) {
      setEditingId(null);
      setEditingName("");
    }
  }

  return (
    <section className="listsPage">
      <header className="listsHeader">
        <div>
          <h2>Shopping lists</h2>
          <p>Save the groceries you buy every week, then drop a whole list into your cart.</p>
        </div>
        <form className="listsCreate" onSubmit={submitCreate}>
          <label>
            New list
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Weekly staples"
              maxLength={40}
              aria-label="New list name"
              required
            />
          </label>
          <button type="submit" className="listsPrimary">
            Create list
          </button>
        </form>
      </header>

      {notice?.message ? (
        <p className={`status checkoutNotice ${notice.type || "info"}`}>{notice.message}</p>
      ) : null}

      {lists.length === 0 ? (
        <div className="listsEmpty">
          <p>No lists yet. Create one for the groceries you buy every week.</p>
        </div>
      ) : (
        <div className="listsLayout">
          <ul className="listsNav">
            {lists.map((list) => {
              const selected = list.id === activeList?.id;
              return (
                <li key={list.id}>
                  {editingId === list.id ? (
                    <form className="listsRename" onSubmit={submitRename}>
                      <input
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        maxLength={40}
                        aria-label={`Rename ${list.name}`}
                        autoFocus
                      />
                      <button type="submit">Save</button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditingName("");
                        }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className={`listsNavItem ${selected ? "listsNavItemActive" : ""}`}>
                      <button type="button" className="listsNavSelect" onClick={() => onSelect(list.id)}>
                        <span>{list.name}</span>
                        <small>
                          {list.items.length} item{list.items.length === 1 ? "" : "s"}
                        </small>
                      </button>
                      <div className="listsNavActions">
                        <button type="button" onClick={() => startRename(list)}>
                          Rename
                        </button>
                        <button type="button" onClick={() => onDelete(list.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {activeList ? (
            <div className="listsDetail">
              <div className="listsDetailHeader">
                <div>
                  <h3>{activeList.name}</h3>
                  <p>
                    {activeList.items.length} item{activeList.items.length === 1 ? "" : "s"}
                    {activeStoreName
                      ? ` · Add all goes to your ${activeStoreName} cart`
                      : " · Choose a store before adding these to a cart"}
                  </p>
                </div>
                <button
                  type="button"
                  className="listsPrimary"
                  onClick={() => onAddAll(activeList.id)}
                  disabled={activeList.items.length === 0}
                >
                  Add all to cart
                </button>
              </div>

              {activeList.items.length === 0 ? (
                <p className="listsEmptyDetail">
                  This list is empty. Bookmark products in a store to save them here.
                </p>
              ) : (
                <ul className="listsItems">
                  {activeList.items.map((item) => (
                    <li key={item.id} className="listsItem">
                      {item.image_url ? <img src={item.image_url} alt="" /> : <div className="listsItemPlaceholder" />}
                      <div className="listsItemMeta">
                        <strong>{item.name}</strong>
                        <span>
                          {currency(item.price)} · {item.store_id}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="listsRemove"
                        onClick={() => onRemoveItem(activeList.id, item.id)}
                        aria-label={`Remove ${item.name} from ${activeList.name}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
