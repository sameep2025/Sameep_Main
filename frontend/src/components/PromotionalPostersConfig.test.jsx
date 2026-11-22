import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import API from "../api";
import PromotionalPostersConfig from "./PromotionalPostersConfig";

jest.mock("../api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const managedPoster = {
  id: "poster_one",
  key: "promotional/salon-management-software/poster-one-id.png",
  imageUrl:
    "https://ynot-assets.s3.ap-south-1.amazonaws.com/promotional/salon-management-software/poster-one-id.png",
  altText: "YNOT salon billing and customer management poster",
  displayOrder: 1,
  published: false,
  width: 1600,
  height: 900,
};

describe("PromotionalPostersConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    API.get.mockResolvedValue({ data: { posters: [] } });
    API.put.mockImplementation((url, body) =>
      Promise.resolve({ data: { posters: body.posters, cleanupFailed: 0 } })
    );
    API.delete.mockResolvedValue({ data: { removed: true } });
    URL.createObjectURL = jest.fn(() => "blob:poster-preview");
    URL.revokeObjectURL = jest.fn();
    global.Image = class MockImage {
      set src(value) {
        this.naturalWidth = 1600;
        this.naturalHeight = 900;
        setTimeout(() => this.onload?.(), 0);
      }
    };
  });

  test("loads drafts and requires alt text before publishing", async () => {
    API.get.mockResolvedValue({
      data: { posters: [{ ...managedPoster, altText: "" }] },
    });
    render(<PromotionalPostersConfig />);

    const publishButton = await screen.findByRole("button", { name: "Publish" });
    fireEvent.click(publishButton);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add descriptive alt text before publishing"
    );
    expect(API.put).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Descriptive alt text"), {
      target: { value: "Salon owner using YNOT billing and analytics" },
    });
    fireEvent.click(publishButton);

    await waitFor(() => expect(API.put).toHaveBeenCalledTimes(1));
    expect(API.put.mock.calls[0][1].posters[0]).toMatchObject({
      published: true,
      altText: "Salon owner using YNOT billing and analytics",
    });
  });

  test("uploads a managed image as an unpublished draft with dimensions", async () => {
    API.post.mockResolvedValue({
      data: {
        key: managedPoster.key,
        url: managedPoster.imageUrl,
      },
    });
    render(<PromotionalPostersConfig />);
    await screen.findByText("No promotional posters configured yet.");

    const file = new File([new Uint8Array([137, 80, 78, 71])], "salon-poster.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Upload promotional poster"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(API.post).toHaveBeenCalledTimes(1));
    const uploadBody = API.post.mock.calls[0][1];
    expect(uploadBody.get("folderType")).toBe("promotional");
    await waitFor(() => expect(API.put).toHaveBeenCalledTimes(1));
    expect(API.put.mock.calls[0][1].posters[0]).toMatchObject({
      key: managedPoster.key,
      imageUrl: managedPoster.imageUrl,
      published: false,
      width: 1600,
      height: 900,
    });
  });

  test("saves ordering, previews, unpublishes, and removes posters", async () => {
    API.get.mockResolvedValue({
      data: { posters: [{ ...managedPoster, published: true }] },
    });
    window.confirm = jest.fn(() => true);
    render(<PromotionalPostersConfig />);

    await screen.findByText("Published");
    fireEvent.change(screen.getByLabelText("Display order"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save poster details" }));
    await waitFor(() => expect(API.put).toHaveBeenCalledTimes(1));
    expect(API.put.mock.calls[0][1].posters[0].displayOrder).toBe(4);

    fireEvent.click(screen.getByRole("button", { name: /Preview YNOT salon billing/ }));
    expect(screen.getByRole("dialog", { name: "Promotional poster preview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));

    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(API.put).toHaveBeenCalledTimes(2));
    expect(API.put.mock.calls[1][1].posters[0].published).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(API.put).toHaveBeenCalledTimes(3));
    expect(API.put.mock.calls[2][1].posters).toEqual([]);
  });
});
