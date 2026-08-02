-- SPDX-License-Identifier: GPL-3.0-or-later

function Image(image)
  local sourcePrefix = "public/help-images/"
  if image.src:sub(1, #sourcePrefix) == sourcePrefix then
    image.src = image.src:sub(#"public/" + 1)
  end
  return image
end
