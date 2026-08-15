import AffirmationFeed from "../../components/AffirmationFeed.jsx";
import FloatingHeader from "../../components/FloatingHeader.jsx";
import { useT } from "../../lib/i18n.js";

/**
 * The feed, reached directly rather than as Today.
 *
 * Today is now this same feed with the floating controls over it, so the whole
 * implementation lives in `components/AffirmationFeed.jsx` and this route is a
 * header and a title. Kept because the navigator still declares it and a
 * reader who lands here should get a way back rather than a blank screen —
 * there is deliberately no link to it from anywhere, since Today is the door.
 */
const Library = () => {
  const { t } = useT();

  return <AffirmationFeed chrome={<FloatingHeader title={t("library.title")} />} />;
};

export default Library;
